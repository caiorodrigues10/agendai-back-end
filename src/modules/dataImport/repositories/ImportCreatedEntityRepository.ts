/**
 * Repositório do vínculo lote ↔ entidades criadas.
 *
 * É a base do desfazer: só o que o lote criou é removido, e só se o registro
 * não tiver sido alterado depois.
 */
import { prisma } from "@/libs/prismaClient";
import type { ImportEntityType } from "@prisma/client";

export class ImportCreatedEntityRepository {
  async createMany(
    batchId: string,
    barbershopId: string,
    entities: Array<{ entityType: ImportEntityType; entityId: string }>,
  ) {
    if (!entities.length) return { count: 0 };
    return prisma.importCreatedEntity.createMany({
      data: entities.map((entity) => ({
        batchId,
        barbershopId,
        entityType: entity.entityType,
        entityId: entity.entityId,
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
