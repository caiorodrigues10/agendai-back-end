/**
 * Repositório dos lotes de importação.
 *
 * Toda consulta carrega `barbershopId`: é o isolamento multi-tenant. A RLS do
 * banco é a segunda rede de proteção — o filtro do repositório é a primeira.
 */
import { prisma } from "@/libs/prismaClient";
import type {
  ImportBatchStatus,
  ImportFileFormat,
  ImportTargetType,
} from "@prisma/client";

export interface CreateImportBatchData {
  barbershopId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileFormat: ImportFileFormat;
  sheetName?: string | null;
  targetType: ImportTargetType;
  headers?: string[];
  createdById?: string | null;
  expiresAt: Date;
}

export class ImportBatchRepository {
  async create(data: CreateImportBatchData) {
    return prisma.importBatch.create({
      data: {
        barbershopId: data.barbershopId,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
        fileFormat: data.fileFormat,
        sheetName: data.sheetName ?? null,
        targetType: data.targetType,
        headers: data.headers ?? undefined,
        createdById: data.createdById ?? null,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findById(id: string, barbershopId: string) {
    return prisma.importBatch.findFirst({
      where: { id, barbershopId },
    });
  }

  async findByIdAnyTenant(id: string) {
    return prisma.importBatch.findUnique({ where: { id } });
  }

  async update(
    id: string,
    barbershopId: string,
    data: {
      status?: ImportBatchStatus;
      targetType?: ImportTargetType;
      sheetName?: string | null;
      headers?: string[];
      mapping?: unknown;
      totalRows?: number;
      processedRows?: number;
      importedRows?: number;
      failedRows?: number;
      skippedRows?: number;
      errorMessage?: string | null;
      startedAt?: Date | null;
      finishedAt?: Date | null;
      undoneAt?: Date | null;
    },
  ) {
    return prisma.importBatch.updateMany({
      where: { id, barbershopId },
      data: data as never,
    });
  }

  async list(barbershopId: string, limit = 20) {
    return prisma.importBatch.findMany({
      where: { barbershopId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /** Lotes ativos (ainda podem receber confirmação ou processamento). */
  async findActive(barbershopId: string) {
    return prisma.importBatch.findMany({
      where: {
        barbershopId,
        status: {
          in: ["UPLOADED", "MAPPING", "VALIDATING", "AWAITING_CONFIRMATION", "PROCESSING"],
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Quantidade de importações iniciadas na última hora (limite de cota). */
  async countStartedSince(barbershopId: string, since: Date) {
    return prisma.importBatch.count({
      where: { barbershopId, createdAt: { gte: since } },
    });
  }

  /** Lotes que passaram da janela de desfazer (30 dias) e ainda não foram marcados. */
  async findPastUndoWindow(limit = 50) {
    return prisma.importBatch.findMany({
      where: {
        expiresAt: { lte: new Date() },
        status: { notIn: ["UNDONE", "EXPIRED"] },
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
  }

  /** Lotes concluídos cujo arquivo temporário pode ser apagado. */
  async findCompletedForFileCleanup(limit = 50) {
    return prisma.importBatch.findMany({
      where: {
        status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"] },
        finishedAt: { not: null, lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { finishedAt: "asc" },
      take: limit,
    });
  }
}
