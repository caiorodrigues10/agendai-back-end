import { prisma } from "@/libs/prismaClient";
import { unblockOwnerCpfs } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { invalidateSubscriptionCache } from "@/shared/infra/http/middlewares/subscriptionAccessCache";
import {
  qualifyReferralOnPayment,
  revokeReferralOnCancellation,
} from "@/modules/referrals/services/referralService";
import { billingPeriodDays } from "@/shared/constants/subscription";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger('subscriptions:webhook');

export async function handleSubscriptionPaymentWebhook(
  externalReference: string | null | undefined,
  newPaymentStatus: string
): Promise<void> {
  if (!externalReference) return;

  // Aceita prefixo legado (bq-) e novo (ag-) — pagamentos antigos no MP/Abacate
  const match = externalReference.match(
    /^(?:bq|ag)-sub-([0-9a-f-]+)-inv-([0-9a-f-]+)$/
  );
  if (!match) return;

  const [, subscriptionId, invoiceId] = match;

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.subscriptionId !== subscriptionId) return;

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: { select: { billingCycle: true } } },
  });
  if (!subscription) return;

  if (newPaymentStatus === "approved") {
    // Idempotência: invoice já paga → não reestende endDate (OpenCode checkpoint)
    if (invoice.status === "PAID") {
      await qualifyReferralOnPayment(subscription.barbershopId).catch((err) => {
        logger.error({ err, barbershopId: subscription.barbershopId }, 'Failed to qualify referral on payment');
      });
      return;
    }

    const now = new Date();
    const periodDays = billingPeriodDays(subscription.plan?.billingCycle);
    const base =
      subscription.endDate && subscription.endDate > now
        ? new Date(subscription.endDate)
        : now;
    const newEndDate = new Date(base);
    newEndDate.setDate(newEndDate.getDate() + periodDays);

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "PAID", paidAt: new Date() },
      }),
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: "ACTIVE", endDate: newEndDate },
      }),
    ]);

    await invalidateSubscriptionCache(subscription.barbershopId);

    await unblockOwnerCpfs(
      subscription.barbershopId,
      "system",
      externalReference
    ).catch((err) => {
      logger.error({ err, barbershopId: subscription.barbershopId }, 'Failed to unblock owner CPFs');
    });

    await prisma.adminNotification
      .create({
        data: {
          type: "PAYMENT_RECEIVED",
          title: "Pagamento de assinatura confirmado",
          message: `Assinatura ${subscriptionId} renovada. Barbearia: ${subscription.barbershopId}. Ref: ${externalReference}`,
          metadata: JSON.stringify({
            subscriptionId,
            invoiceId,
            barbershopId: subscription.barbershopId,
            externalReference,
            newEndDate,
          }),
        },
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Failed to create payment received admin notification');
      });

    await qualifyReferralOnPayment(subscription.barbershopId).catch((err) => {
      logger.error({ err, barbershopId: subscription.barbershopId }, 'Failed to qualify referral on payment');
    });
  } else if (newPaymentStatus === "in_mediation") {
    // Disputa/contestação em análise — suspende acesso imediatamente até a resolução.
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "PENDING" },
      }),
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: "UNPAID" },
      }),
    ]);

    await invalidateSubscriptionCache(subscription.barbershopId);

    await prisma.adminNotification
      .create({
        data: {
          type: "SUBSCRIPTION_EXPIRED",
          title: "Pagamento sob disputa",
          message: `Pagamento da assinatura ${subscriptionId} entrou em disputa. Acesso suspenso. Barbearia: ${subscription.barbershopId}. Ref: ${externalReference}`,
          metadata: JSON.stringify({
            subscriptionId,
            invoiceId,
            barbershopId: subscription.barbershopId,
            newPaymentStatus,
            externalReference,
          }),
        },
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Failed to create subscription in mediation admin notification');
      });

    await revokeReferralOnCancellation(subscription.barbershopId).catch((err) => {
      logger.error({ err }, 'Failed to revoke referral on cancellation');
    });
  } else if (["charged_back", "refunded"].includes(newPaymentStatus)) {
    // Estorno confirmado (externo via cartão, ou refund total do admin).
    // O dinheiro voltou ao cliente — assinatura CANCELADA com revogação imediata.
    // Guarda: se já estava CANCELADO (ex.: cancelamento via refund admin), não regredir.
    const payment = await prisma.payment.findFirst({
      where: { externalReference },
    });
    const refundedLocally = payment
      ? await prisma.refund.findFirst({
          where: { paymentId: payment.id, status: "SUCCEEDED" },
        })
      : null;

    const wasCanceled = subscription.status === "CANCELED";
    const now = new Date();

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "CANCELLED" },
      }),
      ...(wasCanceled
        ? []
        : [
            prisma.subscription.update({
              where: { id: subscriptionId },
              data: {
                status: "CANCELED",
                cancelDate: now,
                endDate: now,
                cancelReason: subscription.cancelReason ?? "chargeback",
              },
            }),
          ]),
    ]);

    await invalidateSubscriptionCache(subscription.barbershopId);

    await prisma.adminNotification
      .create({
        data: {
          type: "SUBSCRIPTION_EXPIRED",
          title: refundedLocally
            ? "ALERTA: possível dupla devolução (estorno externo + refund interno)"
            : "Pagamento estornado/contestado",
          message: `Assinatura ${subscriptionId} cancelada por estorno. Barbearia: ${subscription.barbershopId}. Ref: ${externalReference}`,
          metadata: JSON.stringify({
            subscriptionId,
            invoiceId,
            barbershopId: subscription.barbershopId,
            newPaymentStatus,
            externalReference,
            refundedLocally: refundedLocally ? { id: refundedLocally.id, amount: refundedLocally.amount } : null,
          }),
        },
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Failed to create chargeback/refund admin notification');
      });

    await revokeReferralOnCancellation(subscription.barbershopId).catch((err) => {
      logger.error({ err }, 'Failed to revoke referral on cancellation');
    });
  } else if (["rejected", "cancelled"].includes(newPaymentStatus)) {
    // Pagamento não efetivado — mantém PAST_DUE (aguardando nova tentativa).
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "CANCELLED" },
      }),
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: "PAST_DUE" },
      }),
    ]);

    await invalidateSubscriptionCache(subscription.barbershopId);

    await prisma.adminNotification
      .create({
        data: {
          type: "SUBSCRIPTION_EXPIRED",
          title: "Pagamento de assinatura rejeitado/cancelado",
          message: `Assinatura ${subscriptionId} ficou como PAST_DUE. Status MP: ${newPaymentStatus}. Ref: ${externalReference}`,
          metadata: JSON.stringify({
            subscriptionId,
            invoiceId,
            barbershopId: subscription.barbershopId,
            newPaymentStatus,
            externalReference,
          }),
        },
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Failed to create payment rejected admin notification');
      });

    await revokeReferralOnCancellation(subscription.barbershopId).catch((err) => {
      logger.error({ err }, 'Failed to revoke referral on cancellation');
    });
  }
}
