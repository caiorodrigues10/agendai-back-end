import { inject, injectable } from 'tsyringe'
import { prisma } from '@/libs/prismaClient'
import { AppError } from '@/shared/errors/AppError'
import { AsaasService } from '@/modules/payments/services/AsaasService'
import { TRIAL_DAYS } from '@/shared/constants/subscription'
import { invalidateSubscriptionCache } from '@/shared/infra/http/middlewares/subscriptionAccessCache'
import { encrypt } from '@/shared/utils/encryption'
import { buildSubscriptionResponse } from '../../utils/subscriptionMapper'
import type { AsaasCreditCardInput } from '../../schemas/subscriptionSchemas'

export interface ISetupTrialCardDTO {
	planId: string
	payerEmail: string
	payerFirstName?: string
	payerLastName?: string
	payerIdentification: { type: 'CPF' | 'CNPJ'; number: string }
	asaasCreditCard: AsaasCreditCardInput
	remoteIp: string
}

/**
 * Inicia o trial e tokeniza o cartão na Asaas, na mesma página.
 * O PAN segue só até a tokenização e não é gravado. O cron pós-trial cobra o token.
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
			name: owner?.name || [data.payerFirstName, data.payerLastName].filter(Boolean).join(' ') || barbershop.name,
			email: data.payerEmail || owner?.email,
			cpfCnpj,
			externalReference: `ag-customer-${barbershopId}`,
		})

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
					},
					include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 1 } },
				})

		const card = data.asaasCreditCard
		const holderName =
			card.holderName ||
			[data.payerFirstName, data.payerLastName].filter(Boolean).join(' ') ||
			owner?.name ||
			barbershop.name

		const tokenized = await this.asaasService.tokenizeCreditCard({
			customer: customerId,
			creditCard: {
				holderName,
				number: card.number,
				expiryMonth: card.expiryMonth,
				expiryYear: card.expiryYear,
				ccv: card.ccv,
			},
			creditCardHolderInfo: {
				name: holderName,
				email: data.payerEmail,
				cpfCnpj,
				postalCode: card.postalCode,
				addressNumber: card.addressNumber,
				phone: card.phone,
			},
			remoteIp: data.remoteIp,
		})

		const encryptedToken = encrypt(tokenized.creditCardToken)
		if (encryptedToken.length > 512) {
			throw new AppError('Token do cartão excedeu o tamanho permitido', 500)
		}

		const last4 = (tokenized.creditCardNumber || card.number).replace(/\D/g, '').slice(-4)
		const saved = await prisma.subscription.update({
			where: { id: subscription.id },
			data: {
				asaasCreditCardToken: encryptedToken,
				cardLast4: last4,
				cardBrand: tokenized.creditCardBrand ?? null,
			},
			include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 1 } },
		})

		await invalidateSubscriptionCache(barbershopId)

		return buildSubscriptionResponse(saved, barbershop.createdAt, TRIAL_DAYS)
	}
}
