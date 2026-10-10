import { prisma } from "@/libs/prismaClient";
import { rlsTransaction } from "@/libs/prismaExtensions";
import { sanitizeNotificationError } from "@/modules/notifications/services/notificationSecurity";

const INVOICE_REFERENCE_PATTERN = /^(?:bq|ag)-sub-([0-9a-f-]+)-inv-([0-9a-f-]+)$/;

function nextAttempt(attempt: number): Date {
  const minutes = Math.min(24 * 60, 2 ** Math.min(attempt, 10));
  return new Date(Date.now() + minutes * 60_000);
}

export async function reconcilePendingRefunds(limit = 25): Promise<{
  reconciled: number;
  failed: number;
}> {
  const refunds = await prisma.refund.findMany({
    where: {
      status: "RECONCILIATION_REQUIRED",
      providerRefundId: { not: null },
      OR: [{ nextReconciliationAt: null }, { nextReconciliationAt: { lte: new Date() } }],
    },
    include: { payment: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let reconciled = 0;
  let failed = 0;
  for (const refund of refunds) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { barbershopId: refund.barbershopId },
        select: { id: true },
      });
      const invoiceId = refund.payment.externalReference?.match(INVOICE_REFERENCE_PATTERN)?.[2];
      await rlsTransaction(async (tx) => {
        await tx.refund.update({
          where: { id: refund.id },
          data: {
            status: "SUCCEEDED",
            completedAt: new Date(),
            nextReconciliationAt: null,
            lastReconciliationError: null,
          },
        });
        await tx.payment.update({
          where: { id: refund.paymentId },
          data: {
            status: "refunded",
            statusDetail: "refunded_reconciled",
            pixQrCode: null,
            pixQrCodeBase64: null,
            pixExpirationDate: null,
          },
        });
        if (invoiceId) {
          await tx.invoice.updateMany({
            where: { id: invoiceId },
            data: { status: "CANCELLED" },
          });
        }
      });
      reconciled += 1;
    } catch (error) {
      const attempt = refund.reconciliationAttempts + 1;
      await prisma.refund.update({
        where: { id: refund.id },
        data: {
          reconciliationAttempts: attempt,
          lastReconciliationError: sanitizeNotificationError(error).message,
          nextReconciliationAt: nextAttempt(attempt),
        },
      });
      failed += 1;
    }
  }
  return { reconciled, failed };
}

