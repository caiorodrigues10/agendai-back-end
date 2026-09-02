import { prisma } from "@/libs/prismaClient";

type EventInput = {
  barbershopId: string;
  clientId: string;
  kind: "SERVICE_COMPLETED" | "PACKAGE_SOLD" | "FIADO_CREATED" | "FIADO_PAYMENT" | "REFUND";
  sourceType: string;
  sourceId: string;
  grossAmount?: number;
  receivedAmount?: number;
  outstandingDelta?: number;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
};

/** Idempotente por evento de origem; nunca altera um lançamento já gravado. */
export async function recordCrmFinancialEvent(input: EventInput): Promise<void> {
  await prisma.crmFinancialEvent.upsert({
    where: {
      barbershopId_sourceType_sourceId_kind: {
        barbershopId: input.barbershopId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        kind: input.kind,
      },
    },
    create: {
      barbershopId: input.barbershopId,
      clientId: input.clientId,
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      grossAmount: input.grossAmount ?? 0,
      receivedAmount: input.receivedAmount ?? 0,
      outstandingDelta: input.outstandingDelta ?? 0,
      occurredAt: input.occurredAt,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
    update: {},
  });
}

export async function recordQueueCompletion(queueItemId: string): Promise<void> {
  if (process.env.VITEST) return;
  const item = await prisma.queueItem.findUnique({
    where: { id: queueItemId },
    include: { appointment: { select: { clientPackageId: true } } },
  });
  if (!item || item.status !== "COMPLETED" || !item.clientId || item.appointment?.clientPackageId) return;
  const amount = item.finalPrice ?? 0;
  const fiado = item.paymentMethod === "fiado";
  await recordCrmFinancialEvent({
    barbershopId: item.barbershopId,
    clientId: item.clientId,
    kind: "SERVICE_COMPLETED",
    sourceType: "queue",
    sourceId: item.id,
    grossAmount: amount,
    receivedAmount: fiado ? 0 : amount,
    outstandingDelta: fiado ? amount : 0,
    occurredAt: item.completedAt ?? new Date(),
    metadata: { paymentMethod: item.paymentMethod ?? null, serviceId: item.serviceId },
  });
}

export async function recordFiadoCreated(fiadoId: string): Promise<void> {
  if (process.env.VITEST) return;
  const fiado = await prisma.fiado.findUnique({ where: { id: fiadoId } });
  if (!fiado?.clientId) return;
  const originatedFromQueue = fiado.notes?.includes("finalizar o atendimento da fila") ?? false;
  await recordCrmFinancialEvent({
    barbershopId: fiado.barbershopId,
    clientId: fiado.clientId,
    kind: "FIADO_CREATED",
    sourceType: "fiado",
    sourceId: fiado.id,
    // A venda já entrou no SERVICE_COMPLETED quando o fiado veio da fila.
    grossAmount: originatedFromQueue ? 0 : fiado.originalAmount,
    outstandingDelta: originatedFromQueue ? 0 : fiado.originalAmount,
    occurredAt: fiado.createdAt,
  });
}

export async function recordFiadoPayment(fiadoPaymentId: string): Promise<void> {
  if (process.env.VITEST) return;
  const payment = await prisma.fiadoPayment.findUnique({
    where: { id: fiadoPaymentId },
    include: { fiado: { select: { barbershopId: true, clientId: true } } },
  });
  if (!payment?.fiado.clientId) return;
  await recordCrmFinancialEvent({
    barbershopId: payment.fiado.barbershopId,
    clientId: payment.fiado.clientId,
    kind: "FIADO_PAYMENT",
    sourceType: "fiado_payment",
    sourceId: payment.id,
    receivedAmount: payment.amount,
    outstandingDelta: -payment.amount,
    occurredAt: payment.createdAt,
  });
}

export async function recordPackageSale(clientPackageId: string): Promise<void> {
  if (process.env.VITEST) return;
  const sale = await prisma.clientPackage.findUnique({ where: { id: clientPackageId } });
  if (!sale) return;
  await recordCrmFinancialEvent({
    barbershopId: sale.barbershopId,
    clientId: sale.clientId,
    kind: "PACKAGE_SOLD",
    sourceType: "client_package",
    sourceId: sale.id,
    grossAmount: sale.pricePaid,
    receivedAmount: sale.pricePaid,
    occurredAt: sale.purchasedAt,
  });
}

/** Backfill explícito, idempotente e acionável por admin; nunca roda em listagem. */
export async function backfillCrmLedger(barbershopId: string): Promise<{ linked: number; events: number; createdEvents: number }> {
  const eventsBefore = await prisma.crmFinancialEvent.count({ where: { barbershopId } });
  const clients = await prisma.salonClient.findMany({
    where: { barbershopId, normalizedWhatsapp: { not: null } },
    select: { id: true, normalizedWhatsapp: true },
  });
  const byPhone = new Map(clients.map((client: any) => [client.normalizedWhatsapp!, client.id]));
  const queues = await prisma.queueItem.findMany({
    where: { barbershopId, clientId: null },
    select: { id: true, whatsapp: true },
  });
  const fiados = await prisma.fiado.findMany({
    where: { barbershopId, clientId: null },
    select: { id: true, whatsapp: true },
  });
  const normalize = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const national = (digits.length === 12 || digits.length === 13) && digits.startsWith("55") ? digits.slice(2) : digits;
    return national.length >= 10 && national.length <= 11 ? national : null;
  };
  let linked = 0;
  await Promise.all(queues.map(async (row: any) => {
    const clientId = byPhone.get(normalize(row.whatsapp) ?? "");
    if (clientId) { await prisma.queueItem.update({ where: { id: row.id }, data: { clientId } }); linked += 1; }
  }));
  await Promise.all(fiados.map(async (row: any) => {
    const clientId = byPhone.get(normalize(row.whatsapp) ?? "");
    if (clientId) { await prisma.fiado.update({ where: { id: row.id }, data: { clientId } }); linked += 1; }
  }));
  const [completed, packageSales, fiadosWithClient, payments] = await Promise.all([
    prisma.queueItem.findMany({ where: { barbershopId, status: "COMPLETED", clientId: { not: null } }, select: { id: true } }),
    prisma.clientPackage.findMany({ where: { barbershopId }, select: { id: true } }),
    prisma.fiado.findMany({ where: { barbershopId, clientId: { not: null } }, select: { id: true } }),
    prisma.fiadoPayment.findMany({ where: { fiado: { barbershopId } }, select: { id: true } }),
  ]);
  await Promise.all(completed.map((item: any) => recordQueueCompletion(item.id)));
  await Promise.all(packageSales.map((sale: any) => recordPackageSale(sale.id)));
  await Promise.all(fiadosWithClient.map((fiado: any) => recordFiadoCreated(fiado.id)));
  await Promise.all(payments.map((payment: any) => recordFiadoPayment(payment.id)));
  const events = await prisma.crmFinancialEvent.count({ where: { barbershopId } });
  return { linked, events, createdEvents: events - eventsBefore };
}

export async function runCrmBackfill(barbershopId: string, version = "crm-ledger-v1") {
  const run = await prisma.crmBackfillRun.create({ data: { barbershopId, version, status: "RUNNING" } });
  try {
    const result = await backfillCrmLedger(barbershopId);
    return await prisma.crmBackfillRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", linkedRecords: result.linked, createdEvents: result.createdEvents, totalEvents: result.events, completedAt: new Date() },
    });
  } catch (error) {
    await prisma.crmBackfillRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 2000) : "Erro desconhecido", completedAt: new Date() },
    });
    throw error;
  }
}
