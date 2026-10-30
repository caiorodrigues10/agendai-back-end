/**
 * Repositório do vínculo lote ↔ entidades tocadas.
 *
 * É a base do desfazer: só o que o lote criou é removido, e só se o registro
 * não tiver sido alterado depois.
 *
 * Duas situações:
 *   • `previousState = null` — o lote **criou** o registro: o desfazer remove;
 *   • `previousState` preenchido — o lote **substituiu** o valor anterior (ex.:
 *     o horário do dia, o preço do produto): o desfazer restaura o valor.
 */
import { prisma } from "@/libs/prismaClient";
import type { ImportEntityType } from "@prisma/client";

export interface ImportCreatedEntityData {
  entityType: ImportEntityType;
  entityId: string;
  /** Valor anterior do registro, quando a importação substituiu o que existia. */
  previousState?: Record<string, unknown> | null;
}

export class ImportCreatedEntityRepository {
  async createMany(
    batchId: string,
    barbershopId: string,
    entities: ImportCreatedEntityData[],
  ) {
    if (!entities.length) return { count: 0 };
    return prisma.importCreatedEntity.createMany({
      data: entities.map((entity) => ({
        batchId,
        barbershopId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        previousState: (entity.previousState ?? null) as never,
      })),
      skipDuplicates: true,
    });
  }

  async listByBatch(batchId: string, barbershopId: string) {
    return prisma.importCreatedEntity.findMany({
      where: { batchId, barbershopId },
    });
  }

  async markUndone(ids: string[]) {
    if (!ids.length) return { count: 0 };
    return prisma.importCreatedEntity.updateMany({
      where: { id: { in: ids } },
      data: { undoneAt: new Date() },
    });
  }
}
