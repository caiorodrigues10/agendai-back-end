/**
 * Helper: cria subscription PAST_DUE + payment Abacate para simulação.
 * Uso: npx tsx scripts/sim-abacate-seed-payment.ts <barbershopId> <planId>
 */
import { prisma } from "../src/libs/prismaClient";

async function main() {
  const [barbershopId, planId] = process.argv.slice(2);
  if (!barbershopId || !planId) {
    console.error("Uso: tsx scripts/sim-abacate-seed-payment.ts <barbershopId> <planId>");
    process.exit(1);
  }

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const stamp = Date.now();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  await prisma.barbershop.update({
    where: { id: barbershopId },
    data: { createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) },
  });

  const subscription = await prisma.subscription.upsert({
    where: { barbershopId },
    update: {
      planId: plan.id,
      status: "PAST_DUE",
      startDate: new Date(),
      endDate: null,
      cancelDate: null,
    },
    create: {
      barbershopId,
      planId: plan.id,
      status: "PAST_DUE",
      startDate: new Date(),
      endDate: null,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      subscriptionId: subscription.id,
      amount: plan.price,
      dueDate,
      status: "PENDING",
      paymentMethod: "payment_link",
    },
  });

  const externalReference = `bq-sub-${subscription.id}-inv-${invoice.id}`;
  const billId = `bill_sim_${stamp}`;

  const payment = await prisma.payment.create({
    data: {
      mpPaymentId: null,
      provider: "ABACATEPAY",
      providerPaymentId: billId,
      checkoutUrl: `https://app.abacatepay.com/pay/${billId}`,
      status: "pending",
      statusDetail: "PENDING",
      paymentMethod: "payment_link",
      transactionAmount: plan.price,
      currency: "BRL",
      description: `Assinatura BarberQueue — ${plan.name}`,
      barbershopId,
      externalReference,
      rawResponse: JSON.stringify({ simulated: true }),
    },
  });

  console.log(
    JSON.stringify({
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
      billId,
      externalReference,
      planName: plan.name,
      planPrice: plan.price,
    })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
