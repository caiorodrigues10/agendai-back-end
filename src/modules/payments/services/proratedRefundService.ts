import { container } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { invalidateSubscriptionCache } from "@/shared/infra/http/middlewares/subscriptionAccessCache";
import { billingPeriodDays } from "@/shared/constants/subscription";
import { MercadoPagoService } from "./MercadoPagoService";
import { AbacatePayService } from "./AbacatePayService";
import { AsaasService } from "./AsaasService";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger('payments:prorated-refund');

export interface ProratedRefundInput {
  barbershopId: string;
  subscription: {
    id: string;
    startDate: Date;
    endDate: Date | null;
    plan: { billingCycle: "MONTHLY" | "YEARLY" | null } | null;
  };
  cancelReason?: string | null;
  pixKey?: string;
  pixKeyType?: string;
  deps?: {
    mp?: MercadoPagoService;
    abacate?: AbacatePayService;
    asaas?: AsaasService;
    now?: Date;
  };
}

export interface ProratedRefundResult {
  refundId: string;
  amount: number;
  status: string;
  reason: string;
}

/** Multa aplicada sobre o valor do reembolso proporcional no cancelamento (20%). */
export const CANCELLATION_REFUND_PENALTY = 0.2;

/**
 * Calcula o valor a devolver proporcionalmente ao período NÃO utilizado
 * de um plano já pago, com multa de cancelamento de 20% sobre o valor do
 * reembolso. Ex.: plano anual usado 2/12 meses → devolve 10/12 × 0,8.
 * O período de referência é o início da última cobrança paga (lida com renovações).
 */
export function computeProratedAmount(input: {
  transactionAmount: number;
  subscription: ProratedRefundInput["subscription"];
  periodStart: Date;
  now: Date;
}): number {
  const periodDays =
    billingPeriodDays(input.subscription.plan?.billingCycle) ?? 30;
  const periodMs = periodDays * 86400000;
  const elapsedMs = Math.max(0, input.now.getTime() - input.periodStart.getTime());
  const usedRatio = Math.min(1, elapsedMs / periodMs);
  const refundRatio = 1 - usedRatio;
  const proportional = Math.round(input.transactionAmount * refundRatio);
  return Math.round(proportional * (1 - CANCELLATION_REFUND_PENALTY));
}

function subscriptionRefPrefixes(subscriptionId: string): string[] {
  return [`ag-sub-${subscriptionId}-inv-`, `bq-sub-${subscriptionId}-inv-`];
}

/**
 * Emite o reembolso proporcional automático da assinatura ao ser cancelada.
 * - MercadoPago: refund parcial real (API suporta valor parcial).
 * - AbacatePay: envia PIX no valor proporcional (API só reembolsa total).
 * Retorna null quando não há pagamento aprovado, valor a devolver ou já devolvido.
 */
export async function issueProratedRefund(
  input: ProratedRefundInput
): Promise<ProratedRefundResult | null> {
  const mp =
    input.deps?.mp ??
    container.resolve<MercadoPagoService>("MercadoPagoService");
  const abacate =
    input.deps?.abacate ??
    container.resolve<AbacatePayService>("AbacatePayService");
  const now = input.deps?.now ?? new Date();

  const payment = await findApprovedPayment(input.barbershopId, input.subscription.id);
  if (!payment) return null;

  const existing = await prisma.refund.findFirst({
    where: { paymentId: payment.id, status: "SUCCEEDED" },
  });
  if (existing) return null;

  const lastInvoice = await prisma.invoice.findFirst({
    where: { subscriptionId: input.subscription.id, status: "PAID", paidAt: { not: null } },
    orderBy: { paidAt: "desc" },
    select: { paidAt: true },
  });
  const periodStart = lastInvoice?.paidAt ?? input.subscription.startDate;

  const amountReais = computeProratedAmount({
    transactionAmount: payment.transactionAmount,
    subscription: input.subscription,
    periodStart,
    now,
  });

  if (amountReais <= 0) return null;

  const amountCents = Math.round(amountReais * 100);
  const reason = input.cancelReason
    ? `Reembolso proporcional automático com multa de 20% (${input.cancelReason})`
    : "Reembolso proporcional automático com multa de 20%";

  const refund = await prisma.refund.create({
    data: {
      paymentId: payment.id,
      barbershopId: payment.barbershopId,
      amount: amountReais,
      reason,
      status: "PENDING",
      provider: payment.provider,
      requestedById: null,
    },
  });

  try {
    let providerRefundId: string;
    let providerStatus: string;

    if (payment.provider === "ABACATEPAY") {
      if (!input.pixKey || !input.pixKeyType) {
        throw new AppError(
          "Chave PIX é obrigatória para devolução proporcional de pagamentos AbacatePay",
          422
        );
      }
      if (amountCents < 100) {
        throw new AppError(
          "Valor a devolver é menor que R$ 1,00 (mínimo para transferência PIX)",
          422
        );
      }
      const pix = await abacate.sendPix({
        amountCents,
        externalId: `refund-${refund.id}`,
        description: reason,
        pixKey: input.pixKey,
        pixKeyType: input.pixKeyType as
          | "CPF"
          | "CNPJ"
          | "PHONE"
          | "EMAIL"
          | "RANDOM"
          | "BR_CODE",
      });
      providerRefundId = pix.id;
      providerStatus = pix.status;
    } else if (payment.provider === "MERCADOPAGO") {
      if (!payment.mpPaymentId) {
        throw new AppError("Pagamento MercadoPago sem identificação no provedor", 400);
      }
      const res = await mp.refundPayment(String(payment.mpPaymentId), amountReais);
      providerRefundId = String(res.id);
      providerStatus = res.status;
    } else if (payment.provider === "ASAAS") {
      // Asaas suporta ESTORNO PARCIAL real — sem chave PIX nem burla.
      if (!payment.providerPaymentId) {
        throw new AppError("Pagamento Asaas sem identificação no provedor", 400);
      }
      const asaas =
        input.deps?.asaas ??
        container.resolve<AsaasService>("AsaasService");
      const res = await asaas.refundPayment(
        payment.providerPaymentId,
        amountReais,
        reason
      );
      providerRefundId = res.id;
      providerStatus = res.status;
    } else {
      throw new AppError(`Provedor de pagamento não suportado: ${payment.provider}`, 400);
    }

    await prisma.$transaction([
      prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: "SUCCEEDED",
          providerRefundId,
          completedAt: new Date(),
        },
      }),
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "refunded",
          statusDetail:
            payment.provider === "ABACATEPAY"
              ? "prorated_refunded_via_pix"
              : "prorated_refunded_partial",
        },
      }),
    ]);

    await invalidateSubscriptionCache(input.barbershopId);

    await prisma.adminNotification
      .create({
        data: {
          type: "PAYMENT_REFUNDED",
          title: "Reembolso proporcional automático",
          message: `Reembolso de R$ ${amountReais} emitido para a barbearia ${input.barbershopId} (${payment.provider}).`,
          metadata: JSON.stringify({
            refundId: refund.id,
            paymentId: payment.id,
            barbershopId: input.barbershopId,
            amount: amountReais,
            provider: payment.provider,
            reason,
          }),
        },
      })
      .catch((err: unknown) => logger.error({ err }, 'Failed to create refund admin notification'));

    return { refundId: refund.id, amount: amountReais, status: "SUCCEEDED", reason };
  } catch (error: any) {
    const message =
      error instanceof AppError ? error.message : error?.message ?? "Erro desconhecido";

    await prisma.refund
      .update({
        where: { id: refund.id },
        data: { status: "FAILED", errorMessage: message },
      })
      .catch((err: unknown) => logger.error({ err }, 'Failed to update refund status to FAILED'));

    await prisma.adminNotification
      .create({
        data: {
          type: "PAYMENT_REFUNDED",
          title: "Falha no reembolso proporcional automático",
          message: `Não foi possível devolver R$ ${amountReais} para a barbearia ${input.barbershopId} (${payment.provider}). ${message}`,
          metadata: JSON.stringify({
            refundId: refund.id,
            paymentId: payment.id,
            barbershopId: input.barbershopId,
            amount: amountReais,
            provider: payment.provider,
            error: message,
          }),
        },
      })
      .catch((err: unknown) => logger.error({ err }, 'Failed to create refund failure admin notification'));

    return { refundId: refund.id, amount: amountReais, status: "FAILED", reason: message };
  }
}

async function findApprovedPayment(
  barbershopId: string,
  subscriptionId: string
) {
  const prefixes = subscriptionRefPrefixes(subscriptionId);
  for (const prefix of prefixes) {
    const payment = await prisma.payment.findFirst({
      where: {
        barbershopId,
        status: "approved",
        externalReference: { startsWith: prefix },
      },
      orderBy: { createdAt: "desc" },
    });
    if (payment) return payment;
  }
  return null;
}

export async function getProratedRefundInfo(params: {
  barbershopId: string;
  subscription: ProratedRefundInput["subscription"];
}): Promise<{
  available: boolean;
  provider: "ABACATEPAY" | "MERCADOPAGO" | "ASAAS" | null;
}> {
  const payment = await findApprovedPayment(
    params.barbershopId,
    params.subscription.id
  );
  if (!payment) return { available: false, provider: null };

  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      subscriptionId: params.subscription.id,
      status: "PAID",
      paidAt: { not: null },
    },
    orderBy: { paidAt: "desc" },
    select: { paidAt: true },
  });

  const amount = computeProratedAmount({
    transactionAmount: payment.transactionAmount,
    subscription: params.subscription,
    periodStart: lastInvoice?.paidAt ?? params.subscription.startDate,
    now: new Date(),
  });

  if (amount <= 0) return { available: false, provider: null };
  return {
    available: true,
    provider:
      payment.provider === "ABACATEPAY"
        ? "ABACATEPAY"
        : payment.provider === "ASAAS"
          ? "ASAAS"
          : "MERCADOPAGO",
  };
}