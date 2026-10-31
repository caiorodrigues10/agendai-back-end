/**
 * Repository dos pedidos de exportação.
 *
 * Todas as consultas passam pela RLS do tenant (`setRlsContext` injeta o
 * barbershop_id no Prisma). O worker também usa o repository — a RLS fica
 * ativa porque o worker roda com o contexto do salão do job.
 */
import { prisma } from "@/libs/prismaClient";
import type { Prisma } from "@prisma/client";

export class ExportJobRepository {
  async create(data: Prisma.ExportJobUncheckedCreateInput) {
    return prisma.exportJob.create({ data });
  }

  async findById(barbershopId: string, id: string) {
    return prisma.exportJob.findFirst({ where: { id, barbershopId } });
  }

  /** Job ativo (pendente ou em processamento) — para idempotência. */
  async findActiveByIdempotencyKey(
    barbershopId: string,
    key: {
      periodPreset: string;
      periodFrom: Date | null;
      periodTo: Date | null;
      modules: Prisma.InputJsonValue;
      format: string;
    },
  ) {
    return prisma.exportJob.findFirst({
      where: {
        barbershopId,
        status: { in: ["PENDING", "PROCESSING"] },
        periodPreset: key.periodPreset,
        periodFrom: key.periodFrom,
        periodTo: key.periodTo,
        format: key.format as "XLSX" | "CSV_ZIP" | "PDF",
        modules: { equals: key.modules },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Quantos jobs ativos o salão tem. */
  async countActive(barbershopId: string): Promise<number> {
    return prisma.exportJob.count({
      where: { barbershopId, status: { in: ["PENDING", "PROCESSING"] } },
    });
  }

  /** Jobs iniciados na última hora (cota). */
  async countRecent(barbershopId: string, since: Date): Promise<number> {
    return prisma.exportJob.count({
      where: { barbershopId, createdAt: { gte: since } },
    });
  }

  async list(barbershopId: string, limit = 50) {
    return prisma.exportJob.findMany({
      where: { barbershopId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async markProcessing(id: string): Promise<void> {
    await prisma.exportJob.update({
      where: { id },
      data: { status: "PROCESSING", startedAt: new Date() },
    });
  }

  async updateProgress(id: string, progress: Prisma.InputJsonValue): Promise<void> {
    await prisma.exportJob.update({ where: { id }, data: { progress } });
  }

  async markCompleted(
    id: string,
    data: { filePath: string; fileName: string; fileSizeBytes: number; expiresAt: Date },
  ): Promise<void> {
    await prisma.exportJob.update({
      where: { id },
      data: { status: "COMPLETED", finishedAt: new Date(), ...data },
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await prisma.exportJob.update({
      where: { id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: errorMessage.slice(0, 2000) },
    });
  }

  /** Apaga o arquivo e marca como expirado (exclusão manual ou cron). */
  async markExpired(id: string): Promise<void> {
    await prisma.exportJob.update({
      where: { id },
      data: { status: "EXPIRED", filePath: null },
    });
  }

  /** Jobs concluídos com download ainda válido (para o cron). */
  async findExpiredCandidates(now: Date) {
    return prisma.exportJob.findMany({
      where: {
        status: "COMPLETED",
        filePath: { not: null },
        expiresAt: { lte: now },
      },
      select: { id: true, filePath: true },
    });
  }
}

export const exportJobRepository = new ExportJobRepository();
