/**
 * Desfazer uma importação.
 *
 * O desfazer remove **apenas** o que o lote criou e **apenas** o que não foi
 * mexido depois. Se o dono editou um cliente importado, ou um agendamento
 * importado ganhou pagamento, o registro é preservado — o desfazer nunca
 * apaga trabalho posterior.
 *
 * Janela: 30 dias a partir da criação do lote.
 */
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { rlsTransaction } from "@/libs/prismaExtensions";
import { requestContext } from "@/shared/infra/http/requestContext";
import { ImportBatchRepository } from "./repositories/ImportBatchRepository";
import { ImportCreatedEntityRepository } from "./repositories/ImportCreatedEntityRepository";
import { revertCrmCountersForBatch } from "./crmCounters";

const logger = getModuleLogger("data-import:undo");

export interface UndoImportResult {
  batchId: string;
  removed: number;
  kept: number;
  details: Array<{ entityType: string; entityId: string; action: "removed" | "kept"; reason?: string }>;
}

/** Desfaz o lote e devolve o que foi removido e o que foi preservado. */
export async function undoImportBatch(
  barbershopId: string,
  batchId: string,
): Promise<UndoImportResult> {
  const batches = new ImportBatchRepository();
  const entitiesRepo = new ImportCreatedEntityRepository();

  const batch = await batches.findById(batchId, barbershopId);
  if (!batch) throw new AppError("Importação não encontrada.", 404);
  if (batch.undoneAt) throw new AppError("Esta importação já foi desfeita.", 409);
  if (!["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(batch.status)) {
    throw new AppError("Só é possível desfazer uma importação concluída.", 409);
  }
  if (batch.expiresAt.getTime() <= Date.now()) {
    throw new AppError(
      "O prazo de 30 dias para desfazer esta importação expirou.",
      409,
    );
  }

  const entities = await entitiesRepo.listByBatch(batch.id, barbershopId);
  const details: UndoImportResult["details"] = [];
  const removedAppointments: Array<{ clientId: string | null; date: Date; status: string }> = [];
  let removed = 0;
  let kept = 0;

  // A ordem importa: agendamentos primeiro (referenciam cliente, serviço e
  // caso), depois caso, cliente e serviço.
  const order: Array<"APPOINTMENT" | "CASE" | "CLIENT" | "SERVICE"> = [
    "APPOINTMENT",
    "CASE",
    "CLIENT",
    "SERVICE",
  ];

  await requestContext.run({ barbershopId }, async () => {
    for (const entityType of order) {
      const ofType = entities.filter((entity) => entity.entityType === entityType);
      if (!ofType.length) continue;

      for (const entity of ofType) {
        const outcome = await removeEntity(
          barbershopId,
          entityType,
          entity.entityId,
          batch.finishedAt ?? batch.createdAt,
        );
        details.push({
          entityType,
          entityId: entity.entityId,
          action: outcome.removed ? "removed" : "kept",
          reason: outcome.reason,
        });
        if (outcome.removed) {
          removed += 1;
          if (entityType === "APPOINTMENT" && outcome.appointment) {
            removedAppointments.push(outcome.appointment);
          }
        } else kept += 1;
      }
    }
  });

  const undoneIds = details.filter((item) => item.action === "removed").map((item) => item.entityId);
  const entityIds = entities.map((entity) => entity.id);
  await entitiesRepo.markUndone(entityIds);

  // Os contadores de CRM voltam ao que eram: só o que o lote criou sai da
  // conta — o que o dono criou depois continua contando.
  await revertCrmCountersForBatch(barbershopId, removedAppointments);

  await batches.update(batch.id, barbershopId, {
    status: "UNDONE",
    undoneAt: new Date(),
  });

  logger.info({ batchId, removed, kept }, "Importação desfeita");

  void undoneIds;

  return { batchId, removed, kept, details };
}

/** Remove a entidade se ela ainda estiver "intacta". */
async function removeEntity(
  barbershopId: string,
  entityType: "CLIENT" | "SERVICE" | "APPOINTMENT" | "CASE",
  entityId: string,
  referenceDate: Date,
): Promise<{
  removed: boolean;
  reason?: string;
  appointment?: { clientId: string | null; date: Date; status: string };
}> {
  return rlsTransaction(async (tx) => {
    if (entityType === "APPOINTMENT") {
      const appointment = await tx.appointment.findFirst({
        where: { id: entityId, barbershopId },
        select: {
          id: true,
          updatedAt: true,
          clientId: true,
          date: true,
          status: true,
          _count: { select: { review: true, deposit: true, commissionEntries: true, queueItems: true } },
        },
      });
      if (!appointment) return { removed: false, reason: "Registro já não existe." };
      if (appointment._count.review + appointment._count.deposit + appointment._count.commissionEntries + appointment._count.queueItems > 0) {
        return { removed: false, reason: "O agendamento ganhou registros depois da importação." };
      }
      if (appointment.updatedAt.getTime() > referenceDate.getTime()) {
        return { removed: false, reason: "O agendamento foi alterado depois da importação." };
      }
      await tx.appointment.delete({ where: { id: entityId } });
      return {
        removed: true,
        appointment: {
          clientId: appointment.clientId,
          date: appointment.date,
          status: appointment.status,
        },
      };
    }

    if (entityType === "CLIENT") {
      const client = await tx.salonClient.findFirst({
        where: { id: entityId, barbershopId },
        select: {
          id: true,
          updatedAt: true,
          _count: { select: { appointments: true, reviews: true, financialEvents: true, fiados: true } },
        },
      });
      if (!client) return { removed: false, reason: "Registro já não existe." };
      if (client._count.appointments + client._count.reviews + client._count.financialEvents + client._count.fiados > 0) {
        return { removed: false, reason: "O cliente ganhou movimentações depois da importação." };
      }
      if (client.updatedAt.getTime() > referenceDate.getTime()) {
        return { removed: false, reason: "O cliente foi alterado depois da importação." };
      }
      await tx.salonClient.delete({ where: { id: entityId } });
      return { removed: true };
    }

    if (entityType === "SERVICE") {
      const service = await tx.service.findFirst({
        where: { id: entityId, barbershopId },
        select: {
          id: true,
          updatedAt: true,
          _count: { select: { appointments: true, clientPackages: true, servicePackages: true } },
        },
      });
      if (!service) return { removed: false, reason: "Registro já não existe." };
      if (service._count.appointments + service._count.clientPackages + service._count.servicePackages > 0) {
        return { removed: false, reason: "O serviço foi usado depois da importação." };
      }
      if (service.updatedAt.getTime() > referenceDate.getTime()) {
        return { removed: false, reason: "O serviço foi alterado depois da importação." };
      }
      await tx.service.delete({ where: { id: entityId } });
      return { removed: true };
    }

    const clientCase = await tx.clientCase.findFirst({
      where: { id: entityId, barbershopId },
      select: {
        id: true,
        updatedAt: true,
        _count: { select: { appointments: true, tasks: true, events: true, deadlines: true } },
      },
    });
    if (!clientCase) return { removed: false, reason: "Registro já não existe." };
    if (clientCase._count.appointments + clientCase._count.tasks + clientCase._count.events + clientCase._count.deadlines > 0) {
      return { removed: false, reason: "O caso ganhou andamentos depois da importação." };
    }
    if (clientCase.updatedAt.getTime() > referenceDate.getTime()) {
      return { removed: false, reason: "O caso foi alterado depois da importação." };
    }
    await tx.clientCase.delete({ where: { id: entityId } });
    return { removed: true };
  });
}
