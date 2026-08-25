import { inject, injectable } from 'tsyringe'
import { prisma } from '@/libs/prismaClient'
import { AppError } from '@/shared/errors/AppError'
import { AsaasService } from '@/modules/payments/services/AsaasService'
import { TRIAL_DAYS } from '@/shared/constants/subscription'
import { invalidateSubscriptionCache } from '@/shared/infra/http/middlewares/subscriptionAccessCache'
import { buildSubscriptionResponse } from '../../utils/subscriptionMapper'

export interface ISetupTrialCardDTO {
	planId: string
	payerEmail: string
	payerFirstName?: string
	payerLastName?: string
	payerIdentification: { type: 'CPF' | 'CNPJ'; number: string }
	asaasCreditCard: {
		holderName: string
		number: string
		expiryMonth: string
		expiryYear: string
		ccv: string
		postalCode: string
		addressNumber: string
		phone: string
	}
	remoteIp: string
}

/**
 * Cadastra plano + cartão Asaas **sem cobrança** (trial).
 * Token fica vaulted para cobrança automática após TRIAL_DAYS.
 */
@injectable()
export class SetupTrialCardUseCase {
	constructor(
		@inject('AsaasService')
		private asaasService: AsaasService,
	) {}

	async execute(
		data: ISetupTrialCardDTO,
		requestingUser: { id: string; role: string; barbershopId?: string | null },
	) {
		if (requestingUser.role === 'EMPLOYEE') {
			throw new AppError('Apenas o dono pode cadastrar o cartão', 403)
		}
		if (!requestingUser.barbershopId && requestingUser.role !== 'MASTER_ADMIN') {
			throw new AppError('Usuário sem salão vinculado', 400)
		}

		const barbershopId = requestingUser.barbershopId!
		const barbershop = await prisma.barbershop.findUnique({
			where: { id: barbershopId },
			select: { id: true, name: true, createdAt: true, whatsapp: true },
		})
		if (!barbershop) throw new AppError('Salão não encontrado', 404)

		const plan = await prisma.plan.findFirst({
			where: { id: data.planId, active: true },
		})
		if (!plan) throw new AppError('Plano inválido ou inativo', 400)

		const owner = await prisma.user.findUnique({
			where: { id: requestingUser.id },
			select: { name: true, email: true, cpf: true },
		})

		const cpfCnpj = data.payerIdentification.number.replace(/\D/g, '')
		const customerId = await this.asaasService.ensureCustomer({
			name: owner?.name || data.asaasCreditCard.holderName,
			email: data.payerEmail || owner?.email,
			cpfCnpj,
			externalReference: `ag-customer-${barbershopId}`,
		})

		const card = data.asaasCreditCard
		const expiryYear =
			card.expiryYear.length === 2 ? `20${card.expiryYear}` : card.expiryYear

		const tokenized = await this.asaasService.tokenizeCreditCard({
			customer: customerId,
			creditCard: {
				holderName: card.holderName,
				number: card.number,
				expiryMonth: card.expiryMonth.padStart(2, '0'),
				expiryYear,
				ccv: card.ccv,
			},
			creditCardHolderInfo: {
				name: card.holderName,
				email: data.payerEmail,
				cpfCnpj,
				postalCode: card.postalCode,
				addressNumber: card.addressNumber,
				phone: card.phone,
			},
			remoteIp: data.remoteIp || '127.0.0.1',
		})

		const last4 =
			tokenized.creditCardNumber?.replace(/\D/g, '').slice(-4) ||
			card.number.slice(-4)

		const trialEnd = new Date(barbershop.createdAt)
		trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS)

		const existing = await prisma.subscription.findUnique({
			where: { barbershopId },
		})

		if (existing?.status === 'ACTIVE' && existing.asaasCreditCardToken) {
			throw new AppError(
				'Você já possui assinatura ativa com cartão cadastrado.',
				409,
			)
		}

		const subscription = existing
			? await prisma.subscription.update({
					where: { id: existing.id },
					data: {
						planId: plan.id,
						status: 'TRIALING',
						endDate: trialEnd,
						asaasCustomerId: customerId,
						asaasCreditCardToken: tokenized.creditCardToken,
						cardLast4: last4,
						cardBrand: tokenized.creditCardBrand ?? null,
						cancelDate: null,
						cancelReason: null,
					},
					include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 1 } },
				})
			: await prisma.subscription.create({
					data: {
						barbershopId,
						planId: plan.id,
						status: 'TRIALING',
						startDate: new Date(),
						endDate: trialEnd,
						asaasCustomerId: customerId,
						asaasCreditCardToken: tokenized.creditCardToken,
						cardLast4: last4,
						cardBrand: tokenized.creditCardBrand ?? null,
					},
					include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 1 } },
				})

		await invalidateSubscriptionCache(barbershopId);

		return buildSubscriptionResponse(subscription, barbershop.createdAt, TRIAL_DAYS)
	}
}
