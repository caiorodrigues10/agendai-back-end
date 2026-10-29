/**
 * Repositório do resultado por linha do lote.
 *
 * A chave única (batchId, rowNumber) é o que garante idempotência: ao
 * reprocessar um lote, a linha já processada é reconhecida e não roda de novo.
 */
import { prisma } from "@/libs/prismaClient";
import type { ImportEntityType, ImportRowStatus } from "@prisma/client";

export interface ImportRowResultData {
  batchId: string;
  barbershopId: string;
  rowNumber: number;
  status: ImportRowStatus;
  entityType?: ImportEntityType | null;
  entityId?: string | null;
  errorMessage?: string | null;
}

export class ImportRowResultRepository {
  async createMany(rows: ImportRowResultData[]) {
    if (!rows.length) return { count: 0 };
    return prisma.importRowResult.createMany({
      data: rows.map((row) => ({
        batchId: row.batchId,
        barbershopId: row.barbershopId,
        rowNumber: row.rowNumber,
        status: row.status,
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
        errorMessage: row.errorMessage ?? null,
      })),
      skipDuplicates: true,
    });
  }

  async update(
    batchId: string,
    rowNumber: number,
    data: {
      status: ImportRowStatus;
      entityType?: ImportEntityType | null;
      entityId?: string | null;
      errorMessage?: string | null;
    },
  ) {
    return prisma.importRowResult.updateMany({
      where: { batchId, rowNumber },
      data: data as never,
    });
  }

  /** Linhas já processadas — o worker pula essas. */
  async findProcessed(batchId: string) {
    return prisma.importRowResult.findMany({
      where: {
        batchId,
        status: { in: ["IMPORTED", "SKIPPED", "FAILED"] },
      },
      select: { rowNumber: true, status: true, entityId: true, entityType: true },
    });
  }

  async listByBatch(batchId: string, barbershopId: string, limit = 500) {
    return prisma.importRowResult.findMany({
      where: { batchId, barbershopId },
      orderBy: { rowNumber: "asc" },
      take: limit,
    });
  }

  async countByStatus(batchId: string) {
    const grouped = await prisma.importRowResult.groupBy({
      by: ["status"],
      where: { batchId },
      _count: { _all: true },
    });
    return grouped.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});
  }
}
