/**
 * Desfazer uma importação.
 *
 * O desfazer remove **apenas** o que o lote criou e **apenas** o que não foi
 * mexido depois. Se o dono editou um cliente importado, ou um agendamento
 * importado ganhou pagamento, o registro é preservado — o desfazer nunca
 * apaga trabalho posterior.
 *
 * Duas situações, distinguidas pelo `previousState` gravado no vínculo:
 *   • `previousState` vazio — o lote **criou** o registro: o desfazer remove;
 *   • `previousState` preenchido — o lote **substituiu** um valor que já
 *     existia (horário do dia, preço do produto): o desfazer restaura o valor
 *     anterior.
 *
 * O snapshot guardado tem sempre a mesma forma:
 *
 *   { before: { ...valores anteriores... }, applied: { ...valores gravados... } }
 *
 * O `applied` existe para responder "o dono mexeu aqui depois?": se o valor
 * atual do registro for diferente do que a importação gravou, o registro foi
 * mexido depois e é preservado (com o motivo no relatório do desfazer).
 *
 * Janela: 30 dias a partir da criação do lote.
 */
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { rlsTransaction } from "@/libs/prismaExtensions";
import { requestContext } from "@/shared/infra/http/requestContext";
import type { AppTx } from "@/libs/prismaClient";
import { ImportBatchRepository } from "./repositories/ImportBatchRepository";
import { ImportCreatedEntityRepository } from "./repositories/ImportCreatedEntityRepository";
import { revertCrmCountersForBatch } from "./crmCounters";

const logger = getModuleLogger("data-import:undo");

/** Tipos de entidade que o desfazer sabe tratar. */
type UndoEntityType =
  | "APPOINTMENT"
  | "CASE"
  | "CLIENT"
  | "SERVICE"
  | "STAFF_SCHEDULE"
  | "SHOP_SCHEDULE"
  | "TIME_OFF"
  | "PRODUCT"
  | "PRODUCT_CATEGORY"
  | "SERVICE_PACKAGE"
  | "CLIENT_PACKAGE"
  | "FIADO";

export interface UndoImportResult {
  batchId: string;
  removed: number;
  kept: number;
  details: Array<{
    entityType: string;
    entityId: string;
    action: "removed" | "kept" | "restored";
    reason?: string;
  }>;
}

/**
 * Ordem do desfazer: quem depende de quem sai primeiro.
 *
 * Agendamento → caso → fiado → pacote do cliente → pacote do catálogo →
 * folga → horário → produto → categoria → cliente → serviço.
 */
const UNDO_ORDER: UndoEntityType[] = [
  "APPOINTMENT",
  "CASE",
  "FIADO",
  "CLIENT_PACKAGE",
  "SERVICE_PACKAGE",
  "TIME_OFF",
  "STAFF_SCHEDULE",
  "SHOP_SCHEDULE",
  "PRODUCT",
  "PRODUCT_CATEGORY",
  "CLIENT",
  "SERVICE",
];

/** Snapshot do registro tocado pela importação. */
interface EntitySnapshot {
  before: Record<string, unknown>;
  applied: Record<string, unknown>;
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

  const referenceDate = batch.finishedAt ?? batch.createdAt;

  await requestContext.run({ barbershopId }, async () => {
    for (const entityType of UNDO_ORDER) {
      const ofType = entities.filter((entity) => entity.entityType === entityType);
      if (!ofType.length) continue;

      for (const entity of ofType) {
        const outcome = await removeEntity(
          barbershopId,
          entityType,
          entity.entityId,
          referenceDate,
          readSnapshot(entity.previousState),
          batch.id,
        );
        details.push({
          entityType,
          entityId: entity.entityId,
          action: outcome.action,
          reason: outcome.reason,
        });
        if (outcome.action === "removed" || outcome.action === "restored") {
          removed += 1;
        } else kept += 1;
        if (entityType === "APPOINTMENT" && outcome.appointment) {
          removedAppointments.push(outcome.appointment);
        }
      }
    }
  });

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

  return { batchId, removed, kept, details };
}

/** Lê o snapshot gravado no vínculo (formato `{ before, applied }`). */
function readSnapshot(raw: unknown): EntitySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const snapshot = raw as Partial<EntitySnapshot>;
  if (!snapshot.before || typeof snapshot.before !== "object") return null;
  return {
    before: snapshot.before as Record<string, unknown>,
    applied: (snapshot.applied as Record<string, unknown>) ?? {},
  };
}

/**
 * O valor atual do registro é diferente do que a importação gravou?
 * (o dono mexeu depois)
 */
function changedSinceImport(
  applied: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  if (!Object.keys(applied).length) return false;
  return Object.entries(applied).some(([key, value]) => current[key] !== value);
}

interface RemoveOutcome {
  action: "removed" | "kept" | "restored";
  reason?: string;
  appointment?: { clientId: string | null; date: Date; status: string };
}

/**
 * Desfaz uma entidade: remove o que o lote criou, restaura o que o lote
 * substituiu e preserva o que foi mexido depois.
 */
async function removeEntity(
  barbershopId: string,
  entityType: UndoEntityType,
  entityId: string,
  referenceDate: Date,
  snapshot: EntitySnapshot | null,
  batchId: string,
): Promise<RemoveOutcome> {
  return rlsTransaction(async (tx) => {
    switch (entityType) {
      case "APPOINTMENT":
        return undoAppointment(tx, barbershopId, entityId, referenceDate);
      case "CASE":
        return undoCase(tx, barbershopId, entityId, referenceDate);
      case "CLIENT":
        return undoClient(tx, barbershopId, entityId, referenceDate);
      case "SERVICE":
        return undoService(tx, barbershopId, entityId, referenceDate);
      case "STAFF_SCHEDULE":
        return undoStaffSchedule(tx, barbershopId, entityId, referenceDate, snapshot);
      case "SHOP_SCHEDULE":
        return undoShopSchedule(tx, barbershopId, entityId, referenceDate, snapshot);
      case "TIME_OFF":
        return undoTimeOff(tx, barbershopId, entityId, referenceDate);
      case "PRODUCT":
        return undoProduct(tx, barbershopId, entityId, referenceDate, snapshot, batchId);
      case "PRODUCT_CATEGORY":
        return undoProductCategory(tx, barbershopId, entityId, referenceDate);
      case "SERVICE_PACKAGE":
        return undoServicePackage(tx, barbershopId, entityId, referenceDate);
      case "CLIENT_PACKAGE":
        return undoClientPackage(tx, barbershopId, entityId, referenceDate);
      case "FIADO":
        return undoFiado(tx, barbershopId, entityId, referenceDate);
      default:
        return { action: "kept", reason: "Tipo de registro sem regra de desfazer." };
    }
  });
}

async function undoAppointment(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const appointment = await tx.appointment.findFirst({
    where: { id: entityId, barbershopId },
    select: {
      id: true,
      updatedAt: true,
      clientId: true,
      date: true,
      status: true,
      review: { select: { id: true } },
      deposit: { select: { id: true } },
      _count: { select: { commissionEntries: true, queueItems: true } },
    },
  });
  if (!appointment) return { action: "kept", reason: "Registro já não existe." };
  if (
    appointment.review ||
    appointment.deposit ||
    appointment._count.commissionEntries > 0 ||
    appointment._count.queueItems > 0
  ) {
    return { action: "kept", reason: "O agendamento ganhou registros depois da importação." };
  }
  if (appointment.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "O agendamento foi alterado depois da importação." };
  }
  await tx.appointment.delete({ where: { id: entityId } });
  return {
    action: "removed",
    appointment: {
      clientId: appointment.clientId,
      date: appointment.date,
      status: appointment.status,
    },
  };
}

async function undoCase(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const clientCase = await tx.clientCase.findFirst({
    where: { id: entityId, barbershopId },
    select: {
      id: true,
      updatedAt: true,
      _count: { select: { tasks: true, appointments: true, deadlines: true, events: true } },
    },
  });
  if (!clientCase) return { action: "kept", reason: "Registro já não existe." };
  if (
    clientCase._count.tasks +
      clientCase._count.appointments +
      clientCase._count.deadlines +
      clientCase._count.events >
    0
  ) {
    return { action: "kept", reason: "O caso ganhou andamentos depois da importação." };
  }
  if (clientCase.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "O caso foi alterado depois da importação." };
  }
  await tx.clientCase.delete({ where: { id: entityId } });
  return { action: "removed" };
}

async function undoClient(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const client = await tx.salonClient.findFirst({
    where: { id: entityId, barbershopId },
    select: {
      id: true,
      updatedAt: true,
      _count: {
        select: {
          appointments: true,
          packages: true,
          fiados: true,
          financialEvents: true,
          reviews: true,
        },
      },
    },
  });
  if (!client) return { action: "kept", reason: "Registro já não existe." };
  if (
    client._count.appointments +
      client._count.packages +
      client._count.fiados +
      client._count.financialEvents +
      client._count.reviews >
    0
  ) {
    return { action: "kept", reason: "O cliente ganhou movimentações depois da importação." };
  }
  if (client.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "O cliente foi alterado depois da importação." };
  }
  await tx.salonClient.delete({ where: { id: entityId } });
  return { action: "removed" };
}

async function undoService(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const service = await tx.service.findFirst({
    where: { id: entityId, barbershopId },
    select: {
      id: true,
      updatedAt: true,
      _count: { select: { appointments: true, servicePackages: true, clientPackages: true } },
    },
  });
  if (!service) return { action: "kept", reason: "Registro já não existe." };
  if (
    service._count.appointments +
      service._count.servicePackages +
      service._count.clientPackages >
    0
  ) {
    return { action: "kept", reason: "O serviço foi usado depois da importação." };
  }
  if (service.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "O serviço foi alterado depois da importação." };
  }
  await tx.service.delete({ where: { id: entityId } });
  return { action: "removed" };
}

/**
 * Horário do profissional.
 *
 * Criado pelo lote → remove. Substituído pelo lote → restaura o horário
 * anterior (início, fim e ativo) — mas só se o dono não mexeu depois.
 */
async function undoStaffSchedule(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
  snapshot: EntitySnapshot | null,
): Promise<RemoveOutcome> {
  const schedule = await tx.staffSchedule.findFirst({
    where: { id: entityId, barbershopId },
    select: { id: true, updatedAt: true, startTime: true, endTime: true, isActive: true },
  });
  if (!schedule) return { action: "kept", reason: "Registro já não existe." };

  if (snapshot) {
    const current = {
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isActive: schedule.isActive,
    };
    if (changedSinceImport(snapshot.applied, current)) {
      return { action: "kept", reason: "O horário foi alterado depois da importação." };
    }
    await tx.staffSchedule.update({
      where: { id: entityId },
      data: {
        startTime: String(snapshot.before.startTime),
        endTime: String(snapshot.before.endTime),
        isActive: Boolean(snapshot.before.isActive),
      },
    });
    return { action: "restored", reason: "Horário anterior restaurado." };
  }

  if (schedule.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "O horário foi alterado depois da importação." };
  }
  await tx.staffSchedule.delete({ where: { id: entityId } });
  return { action: "removed" };
}

/** Horário do estabelecimento (mesma regra do horário do profissional). */
async function undoShopSchedule(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
  snapshot: EntitySnapshot | null,
): Promise<RemoveOutcome> {
  const schedule = await tx.schedule.findFirst({
    where: { id: entityId, barbershopId },
    select: { id: true, isOpen: true, openTime: true, closeTime: true },
  });
  if (!schedule) return { action: "kept", reason: "Registro já não existe." };

  if (snapshot) {
    const current = {
      isOpen: schedule.isOpen,
      openTime: schedule.openTime,
      closeTime: schedule.closeTime,
    };
    if (changedSinceImport(snapshot.applied, current)) {
      return { action: "kept", reason: "O horário foi alterado depois da importação." };
    }
    await tx.schedule.update({
      where: { id: entityId },
      data: {
        isOpen: Boolean(snapshot.before.isOpen),
        openTime: String(snapshot.before.openTime),
        closeTime: String(snapshot.before.closeTime),
      },
    });
    return { action: "restored", reason: "Horário anterior restaurado." };
  }

  await tx.schedule.delete({ where: { id: entityId } });
  return { action: "removed" };
}

/** Folga/bloqueio: só é removida se ninguém mexeu depois. */
async function undoTimeOff(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const timeOff = await tx.staffTimeOff.findFirst({
    where: { id: entityId, barbershopId },
    select: { id: true, createdAt: true, status: true },
  });
  if (!timeOff) return { action: "kept", reason: "Registro já não existe." };
  // A folga não tem `updatedAt`: quem mexeu depois dela muda o status
  // (aprovou, rejeitou ou cancelou). Status diferente de pendente/aprovada
  // significa intervenção do dono.
  if (timeOff.status === "REJECTED" || timeOff.status === "CANCELED") {
    return { action: "kept", reason: "A folga foi alterada depois da importação." };
  }
  await tx.staffTimeOff.delete({ where: { id: entityId } });
  return { action: "removed" };
}

/**
 * Produto.
 *
 * Criado pelo lote → remove (junto com os movimentos de estoque que ele
 * criou). Substituído pelo lote → restaura preço, estoque mínimo, saldo e
 * custo médio — e remove o movimento de saldo inicial.
 */
async function undoProduct(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
  snapshot: EntitySnapshot | null,
  batchId: string,
): Promise<RemoveOutcome> {
  const product = await tx.product.findFirst({
    where: { id: entityId, barbershopId },
    select: {
      id: true,
      updatedAt: true,
      salePrice: true,
      minStock: true,
      stockQty: true,
      averageCost: true,
      _count: {
        select: {
          movements: true,
          receiptItems: true,
          saleLines: true,
          reservations: true,
          appointmentReservations: true,
        },
      },
    },
  });
  if (!product) return { action: "kept", reason: "Registro já não existe." };

  const importMovements = await tx.stockMovement.findMany({
    where: {
      barbershopId,
      productId: entityId,
      sourceType: "data_import",
      sourceId: batchId,
    },
    select: { id: true },
  });

  const otherMovements = product._count.movements - importMovements.length;
  if (
    otherMovements +
      product._count.receiptItems +
      product._count.saleLines +
      product._count.reservations +
      product._count.appointmentReservations >
    0
  ) {
    return { action: "kept", reason: "O produto foi usado depois da importação." };
  }

  if (snapshot) {
    const current = {
      salePrice: product.salePrice,
      minStock: product.minStock,
      stockQty: product.stockQty,
      averageCost: product.averageCost,
    };
    if (changedSinceImport(snapshot.applied, current)) {
      return { action: "kept", reason: "O produto foi alterado depois da importação." };
    }
    // O produto já existia: volta o valor anterior e sai o movimento de
    // saldo inicial criado pela importação.
    if (importMovements.length) {
      await tx.stockMovement.deleteMany({
        where: { id: { in: importMovements.map((m) => m.id) } },
      });
    }
    await tx.product.update({
      where: { id: entityId },
      data: {
        salePrice: Number(snapshot.before.salePrice),
        minStock: Number(snapshot.before.minStock),
        stockQty: Number(snapshot.before.stockQty),
        averageCost: Number(snapshot.before.averageCost),
      },
    });
    return { action: "restored", reason: "Valores anteriores do produto restaurados." };
  }

  if (product.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "O produto foi alterado depois da importação." };
  }

  // O produto foi criado pelo lote: sai junto com o movimento de estoque.
  if (importMovements.length) {
    await tx.stockMovement.deleteMany({
      where: { id: { in: importMovements.map((m) => m.id) } },
    });
  }
  await tx.product.delete({ where: { id: entityId } });
  return { action: "removed" };
}

/** Categoria de produto criada pelo lote. */
async function undoProductCategory(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const category = await tx.productCategory.findFirst({
    where: { id: entityId, barbershopId },
    select: { id: true, updatedAt: true, _count: { select: { products: true } } },
  });
  if (!category) return { action: "kept", reason: "Registro já não existe." };
  if (category._count.products > 0) {
    return { action: "kept", reason: "A categoria tem produtos depois da importação." };
  }
  if (category.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "A categoria foi alterada depois da importação." };
  }
  await tx.productCategory.delete({ where: { id: entityId } });
  return { action: "removed" };
}

/** Pacote do catálogo: sai só se ninguém comprou depois. */
async function undoServicePackage(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const pkg = await tx.servicePackage.findFirst({
    where: { id: entityId, barbershopId },
    select: { id: true, updatedAt: true, _count: { select: { clientPackages: true } } },
  });
  if (!pkg) return { action: "kept", reason: "Registro já não existe." };
  if (pkg._count.clientPackages > 0) {
    return { action: "kept", reason: "O pacote já foi vendido depois da importação." };
  }
  if (pkg.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "O pacote foi alterado depois da importação." };
  }
  await tx.servicePackage.delete({ where: { id: entityId } });
  return { action: "removed" };
}

/** Saldo de pacote do cliente: sai só se nenhuma sessão foi consumida. */
async function undoClientPackage(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const pkg = await tx.clientPackage.findFirst({
    where: { id: entityId, barbershopId },
    select: {
      id: true,
      updatedAt: true,
      totalSessions: true,
      remainingSessions: true,
      _count: { select: { appointments: true } },
    },
  });
  if (!pkg) return { action: "kept", reason: "Registro já não existe." };
  if (pkg._count.appointments > 0) {
    return { action: "kept", reason: "O pacote do cliente foi usado depois da importação." };
  }
  if (pkg.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "O pacote do cliente foi alterado depois da importação." };
  }
  await tx.clientPackage.delete({ where: { id: entityId } });
  return { action: "removed" };
}

/**
 * Dívida (fiado).
 *
 * Sai só se ninguém recebeu depois da importação — o pagamento de "valor já
 * pago" que a planilha trouxe é removido junto com a dívida.
 */
async function undoFiado(
  tx: AppTx,
  barbershopId: string,
  entityId: string,
  referenceDate: Date,
): Promise<RemoveOutcome> {
  const fiado = await tx.fiado.findFirst({
    where: { id: entityId, barbershopId },
    select: {
      id: true,
      updatedAt: true,
      _count: { select: { payments: true, adjustments: true } },
    },
  });
  if (!fiado) return { action: "kept", reason: "Registro já não existe." };
  if (fiado._count.adjustments > 0) {
    return { action: "kept", reason: "A dívida foi ajustada depois da importação." };
  }
  if (fiado.updatedAt.getTime() > referenceDate.getTime()) {
    return { action: "kept", reason: "A dívida foi alterada depois da importação." };
  }
  // Um pagamento posterior à importação significa que o dono recebeu depois:
  // a dívida não pode sumir junto com o dinheiro que já entrou.
  const laterPayment = await tx.fiadoPayment.findFirst({
    where: { fiadoId: entityId, createdAt: { gt: referenceDate } },
    select: { id: true },
  });
  if (laterPayment) {
    return { action: "kept", reason: "A dívida recebeu pagamento depois da importação." };
  }
  await tx.fiado.delete({ where: { id: entityId } });
  return { action: "removed" };
}
