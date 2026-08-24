import { prisma } from "@/libs/prismaClient";
import { revokeReferralOnCancellation } from "@/modules/referrals/services/referralService";
import { invalidateSubscriptionCache } from "@/shared/infra/http/middlewares/subscriptionAccessCache";
import { issueProratedRefund } from "@/modules/payments/services/proratedRefundService";

export interface CancelSubscriptionResult {
  id: string;
  barbershopId: string;
  planId: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  cancelDate: Date | null;
  cancelReason: string | null;
  plan: { id: string; name: string } | null;
  alreadyCanceled?: boolean;
  proratedRefund?: {
    refundId: string;
    amount: number;
    status: string;
    reason: string;
  } | null;
}

export async function cancelSubscriptionForBarbershop(
  barbershopId: string,
  options?: {
    cancelReason?: string | null;
    /** true = revoga acesso imediatamente (ex.: reembolso total do admin). false = acesso até endDate já pago. */
    revokeImmediately?: boolean;
    /** Chave PIX para devolução proporcional automática (pagamentos AbacatePay). */
    pixKey?: string;
    /** Tipo da chave PIX (CPF, CNPJ, PHONE, EMAIL, RANDOM, BR_CODE). */
    pixKeyType?: string;
  }
): Promise<CancelSubscriptionResult | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { barbershopId },
    include: {
      plan: { select: { id: true, name: true, billingCycle: true } },
    },
  });

  if (!subscription) return null;

  if (subscription.status === "CANCELED") {
    return {
      id: subscription.id,
      barbershopId: subscription.barbershopId,
      planId: subscription.planId,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      cancelDate: subscription.cancelDate,
      cancelReason: subscription.cancelReason,
      plan: subscription.plan,
      alreadyCanceled: true,
    };
  }

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "CANCELED",
      cancelDate: new Date(),
      cancelReason: options?.cancelReason ?? subscription.cancelReason ?? null,
      ...(options?.revokeImmediately ? { endDate: new Date() } : {}),
    },
    include: { plan: { select: { id: true, name: true } } },
  });

  await revokeReferralOnCancellation(barbershopId).catch((err) => {
    console.warn(
      `[CancelSubscription] Falha ao reverter indicação:`,
      err?.message ?? err
    );
  });

  invalidateSubscriptionCache(barbershopId);

  // Reembolso proporcional automático do período não utilizado.
  // Apenas quando NÃO há revogação imediata (reembolso total do admin já devolveu tudo).
  let proratedRefund: CancelSubscriptionResult["proratedRefund"] = null;
  if (!options?.revokeImmediately) {
    try {
      proratedRefund = await issueProratedRefund({
        barbershopId,
        subscription,
        cancelReason: options?.cancelReason ?? null,
        pixKey: options?.pixKey,
        pixKeyType: options?.pixKeyType,
      });
    } catch (err: any) {
      console.warn(
        `[CancelSubscription] Falha ao emitir reembolso proporcional:`,
        err?.message ?? err
      );
    }
  }

  return {
    id: updated.id,
    barbershopId: updated.barbershopId,
    planId: updated.planId,
    status: updated.status,
    startDate: updated.startDate,
    endDate: updated.endDate,
    cancelDate: updated.cancelDate,
    cancelReason: updated.cancelReason,
    plan: updated.plan,
    proratedRefund,
  };
}