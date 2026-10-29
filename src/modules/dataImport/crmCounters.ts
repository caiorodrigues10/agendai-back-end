/**
 * Contadores de CRM da importação de planilhas.
 *
 * Decisão do produto: ao concluir o lote, o cliente importado passa a ter o
 * total de agendamentos e a última visita atualizados — e **nada mais**:
 *
 *   • nenhuma mensagem (WhatsApp/e-mail) é enviada;
 *   • nenhum convite de avaliação é disparado;
 *   • nenhuma comissão é gerada;
 *   • nenhum lançamento financeiro é criado.
 *
 * O histórico importado alimenta o CRM, não o caixa. Quem quiser transformar
 * histórico em receita usa a opção "contar valores no histórico financeiro" e
 * conclui os atendimentos pelo fluxo normal.
 *
 * Idempotência: o lote guarda `crmCountersAppliedAt`. Reprocessar a fila não
 * conta o mesmo agendamento duas vezes.
 */
import { prisma } from "@/libs/prismaClient";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("data-import:crm-counters");

/** Situações que contam como visita (atendimento realizado). */
const VISIT_STATUSES = ["COMPLETED", "CHECKED_IN"] as const;

export interface CrmCountersResult {
  clients: number;
  appointments: number;
  visits: number;
  applied: boolean;
}

/**
 * Atualiza os contadores de CRM dos clientes tocados pelo lote.
 *
 * Roda depois que as linhas foram processadas e antes de o lote ser marcado
 * como concluído — assim o `updatedAt` do cliente continua anterior ao
 * `finishedAt` e o desfazer consegue remover o que o lote criou.
 */
export async function applyCrmCountersForBatch(
  batchId: string,
  barbershopId: string,
): Promise<CrmCountersResult> {
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, barbershopId },
    select: { id: true, crmCountersAppliedAt: true },
  });
  if (!batch) {
    return { clients: 0, appointments: 0, visits: 0, applied: false };
  }
  if (batch.crmCountersAppliedAt) {
    // Já aplicado (retry da fila): nada a fazer.
    return { clients: 0, appointments: 0, visits: 0, applied: false };
  }

  const appointments = await loadBatchAppointments(batchId, barbershopId);
  const perClient = aggregateByClient(appointments);
  let visits = 0;

  for (const [clientId, entry] of perClient) {
    const client = await prisma.salonClient.findFirst({
      where: { id: clientId, barbershopId },
      select: { id: true, lastVisitAt: true },
    });
    if (!client) continue;
    if (entry.latestVisit) visits += 1;
    await prisma.salonClient.update({
      where: { id: client.id },
      data: {
        totalAppointments: { increment: entry.appointments },
        ...(entry.latestVisit
          ? { lastVisitAt: laterDate(client.lastVisitAt, entry.latestVisit) }
          : {}),
      },
    });
  }

  await prisma.importBatch.updateMany({
    where: { id: batchId, barbershopId, crmCountersAppliedAt: null },
    data: { crmCountersAppliedAt: new Date() },
  });

  const result: CrmCountersResult = {
    clients: perClient.size,
    appointments: [...perClient.values()].reduce((sum, entry) => sum + entry.appointments, 0),
    visits,
    applied: true,
  };
  logger.info({ batchId, ...result }, "Contadores de CRM atualizados pela importação");
  return result;
}

/**
 * Desfaz a contagem quando o lote é desfeito.
 *
 * Só os agendamentos removidos entram na conta: o que o dono criou depois
 * continua contando.
 */
export async function revertCrmCountersForBatch(
  barbershopId: string,
  removed: Array<{ clientId: string | null; date: Date; status: string }>,
): Promise<void> {
  const withClient = removed.filter(
    (item): item is { clientId: string; date: Date; status: string } => Boolean(item.clientId),
  );
  if (!withClient.length) return;

  const perClient = aggregateByClient(withClient);
  for (const [clientId, entry] of perClient) {
    const remaining = await prisma.appointment.findFirst({
      where: {
        barbershopId,
        clientId,
        source: "IMPORT",
        status: { in: [...VISIT_STATUSES] },
      },
      select: { date: true },
      orderBy: { date: "desc" },
    });
    await prisma.salonClient.updateMany({
      where: { id: clientId, barbershopId },
      data: {
        totalAppointments: { decrement: entry.appointments },
        lastVisitAt: remaining?.date ?? null,
      },
    });
  }
}

interface ClientCounter {
  appointments: number;
  latestVisit: Date | null;
}

/** Agendamentos criados pelo lote (via vínculo lote ↔ entidade). */
async function loadBatchAppointments(batchId: string, barbershopId: string) {
  const links = await prisma.importCreatedEntity.findMany({
    where: { batchId, barbershopId, entityType: "APPOINTMENT" },
    select: { entityId: true },
  });
  if (!links.length) return [];
  return prisma.appointment.findMany({
    where: { id: { in: links.map((link) => link.entityId) }, barbershopId },
    select: { clientId: true, date: true, status: true },
  });
}

/** Agrupa por cliente: total de agendamentos e data da última visita. */
function aggregateByClient(
  appointments: Array<{ clientId: string | null; date: Date; status: string }>,
): Map<string, ClientCounter> {
  const perClient = new Map<string, ClientCounter>();
  for (const appointment of appointments) {
    if (!appointment.clientId) continue;
    const current = perClient.get(appointment.clientId) ?? { appointments: 0, latestVisit: null };
    current.appointments += 1;
    if (
      (VISIT_STATUSES as readonly string[]).includes(appointment.status) &&
      (!current.latestVisit || appointment.date > current.latestVisit)
    ) {
      current.latestVisit = appointment.date;
    }
    perClient.set(appointment.clientId, current);
  }
  return perClient;
}

/** Data mais recente entre as duas (a anterior nunca é sobrescrita por uma antiga). */
function laterDate(current: Date | null, next: Date): Date {
  if (!current) return next;
  return next > current ? next : current;
}
