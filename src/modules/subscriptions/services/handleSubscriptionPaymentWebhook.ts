import { prisma } from "@/libs/prismaClient";

export async function handleSubscriptionPaymentWebhook(
  externalReference: string | null | undefined,
  newPaymentStatus: string
): Promise<void> {
  if (!externalReference) return;

  // Padrão: bq-sub-<subscriptionId>-inv-<invoiceId>
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
  }
}