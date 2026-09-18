import { inject, injectable } from 'tsyringe'
import { prisma } from '@/libs/prismaClient'
import { AppError } from '@/shared/errors/AppError'
import { AsaasService } from '@/modules/payments/services/AsaasService'
import { IPaymentRepository } from '@/modules/payments/repositories/IPaymentRepository'
import { TRIAL_DAYS } from '@/shared/constants/subscription'
import { invalidateSubscriptionCache } from '@/shared/infra/http/middlewares/subscriptionAccessCache'
import { buildSubscriptionResponse } from '../../utils/subscriptionMapper'

export interface ISetupTrialCardDTO {
	planId: string
	payerEmail: string
	payerFirstName?: string
	payerLastName?: string
	payerIdentification: { type: 'CPF' | 'CNPJ'; number: string }
	asaasCreditCard?: unknown
	remoteIp: string
}

/**
 * Inicia trial e gera cobrança CREDIT_CARD no Asaas **sem** PAN no Fastify.
 * O titular informa o cartão em `invoiceUrl` (checkout hospedado).
 * Tokens vaulted antigos continuam sendo cobrados pelo cron pós-trial.
 */
@injectable()
export class SetupTrialCardUseCase {
	constructor(
		@inject('AsaasService')
		private asaasService: AsaasService,
		@inject('PaymentRepository')
		private paymentRepo: IPaymentRepository,
	) {}

	async execute(
		data: ISetupTrialCardDTO,
		requestingUser: { id: string; role: string; barbershopId?: string | null },
	) {
		if (data.asaasCreditCard != null) {
			throw new AppError(
				'PAN/CVV não são aceitos no servidor. Use o checkout hospedado Asaas.',
				400,
			)
		}
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
		const dueDateStr = trialEnd.toISOString().slice(0, 10)

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

		const payment = await this.asaasService.createPayment({
			customer: customerId,
			billingType: 'CREDIT_CARD',
			value: plan.price,
			dueDate: dueDateStr,
			description: `Assinatura ${plan.name} (após trial)`,
			externalReference: `ag-trial-${barbershopId}`,
		})

		const paymentRecord = await this.paymentRepo.create({
			mpPaymentId: null,
			provider: 'ASAAS',
			providerPaymentId: payment.id,
			checkoutUrl: payment.invoiceUrl ?? null,
			status: 'pending',
			statusDetail: payment.status ?? 'PENDING',
			paymentMethod: 'credit_card',
			transactionAmount: plan.price,
			currency: 'BRL',
			description: `Assinatura ${plan.name} (após trial)`,
			barbershopId,
			externalReference: `ag-trial-${barbershopId}`,
			rawResponse: JSON.stringify(payment),
		})

		await invalidateSubscriptionCache(barbershopId)

		return {
			...buildSubscriptionResponse(subscription, barbershop.createdAt, TRIAL_DAYS),
			payment: paymentRecord,
		}
	}
}
