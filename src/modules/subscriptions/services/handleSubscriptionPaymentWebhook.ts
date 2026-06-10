import { prisma } from "@/libs/prismaClient";
import { unblockOwnerCpfs } from "@/modules/subscriptions/utils/checkBarbershopAccess";

export async function handleSubscriptionPaymentWebhook(
  externalReference: string | null | undefined,
  newPaymentStatus: string
): Promise<void> {
  if (!externalReference) return;

  const match = externalReference.match(
    /^bq-sub-([0-9a-f-]+)-inv-([0-9a-f-]+)$/
  );
  if (!match) return;

  const [, subscriptionId, invoiceId] = match;

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.subscriptionId !== subscriptionId) return;

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId }
  });
  if (!subscription) return;

  if (newPaymentStatus === "approved") {
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + 30);

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "PAID", paidAt: new Date() }
      }),
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: "ACTIVE", endDate: newEndDate }
      })
    ]);

    // Desbloqueio automático dos CPFs dos owners
    await unblockOwnerCpfs(
      subscription.barbershopId,
      "system",
      externalReference
    ).catch((err) => {
      console.warn(
        `[WebhookSubscription] Falha ao desbloquear CPFs da barbearia ${subscription.barbershopId}:`,
        err?.message ?? err
      );
    });

    // Notificação de pagamento confirmado
    await prisma.adminNotification.create({
      data: {
        type: "PAYMENT_RECEIVED",
        title: "Pagamento de assinatura confirmado",
        message: `Assinatura ${subscriptionId} renovada. Barbearia: ${subscription.barbershopId}. Ref: ${externalReference}`,
        metadata: JSON.stringify({
          subscriptionId,
          invoiceId,
          barbershopId: subscription.barbershopId,
          externalReference,
          newEndDate
        })
      }
    }).catch(() => {/* não quebra o fluxo */ });

  } else if (["rejected", "cancelled", "charged_back"].includes(newPaymentStatus)) {
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "CANCELLED" }
      }),
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: "PAST_DUE" }
      })
    ]);

    // Notificação de assinatura expirada
    await prisma.adminNotification.create({
      data: {
        type: "SUBSCRIPTION_EXPIRED",
        title: "Pagamento de assinatura rejeitado/cancelado",
        message: `Assinatura ${subscriptionId} ficou como PAST_DUE. Status MP: ${newPaymentStatus}. Ref: ${externalReference}`,
        metadata: JSON.stringify({
          subscriptionId,
          invoiceId,
          barbershopId: subscription.barbershopId,
          newPaymentStatus,
          externalReference
        })
      }
    }).catch(() => {/* não quebra o fluxo */ });
  }
}