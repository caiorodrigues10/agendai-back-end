import { prisma } from "@/libs/prismaClient";
import { enqueueWhatsApp } from "@/shared/infra/queue";

export async function notifyQueueCapacity(barbershopId: string, queueItemId: string, customerName: string) {
  const [shop, waiting] = await Promise.all([
    prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { name: true, whatsapp: true, queueAlertEnabled: true, queueAlertThreshold: true, queueAlertPhone: true, evolutionInstanceName: true },
    }),
    prisma.queueItem.count({ where: { barbershopId, status: "WAITING" } }),
  ]);
  const destination = shop?.queueAlertPhone || shop?.whatsapp;
  const instanceName = shop?.evolutionInstanceName?.trim() || process.env.EVOLUTION_INSTANCE_NAME?.trim();
  if (!shop?.queueAlertEnabled || !destination || !instanceName || waiting <= shop.queueAlertThreshold) return;
  await enqueueWhatsApp({
    phone: destination,
    instanceName,
    barbershopId,
    sourceType: "QUEUE_CAPACITY",
    sourceId: queueItemId,
    deduplicationKey: `queue-capacity:${barbershopId}:${queueItemId}`,
    notificationType: "QUEUE_CAPACITY_ALERT",
    message: `⚠️ *Fila acima do limite*\n\n*${shop.name}* está com ${waiting} clientes aguardando.\nLimite configurado: ${shop.queueAlertThreshold} clientes.\nNovo cliente: ${customerName}.\nAbra o AgendAI para acompanhar a fila.`,
  });
}
