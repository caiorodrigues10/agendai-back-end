/**
 * Use cases da exportação de planilhas.
 *
 * Regras que moram aqui:
 *   • **Cota** — 1 exportação ativa por salão e 10 por hora (env
 *     `EXPORT_MAX_JOBS_PER_HOUR`).
 *   • **Idempotência** — pedido idêntico em andamento reaproveita o job.
 *   • **Gating** — módulo oculto pelo segmento (`isModuleEnabled`) ou
 *     indisponível no plano não entra na planilha.
 *   • **Sigilo** — LAW_FIRM não exporta caso/processo sem opção explícita;
 *     `advertisingRestricted` remove avaliações/fidelidade/indicações/vouchers.
 */
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import { isModuleEnabled } from "@/shared/segments/segmentGate";
import { isAdvertisingRestricted } from "@/shared/segments/advertising";
import { exportJobRepository } from "./repositories/ExportJobRepository";
import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_MODULES,
  GERENTIAL_MODULES,
  MAX_ACTIVE_EXPORTS,
  maxExportsPerHour,
} from "./dataExport.constants";
import { resolveExportPeriod } from "./utils/exportPeriod";
import type {
  CreateExportInput,
  ExportJobSummary,
  ExportModuleKey,
  ExportOptions,
  ExportPeriod,
  ExportProgress,
} from "./dataExport.types";
import type { BusinessSegment, Prisma } from "@prisma/client";

/** Converte o job do Prisma no resumo da API. */
function toSummary(job: {
  id: string;
  periodPreset: string;
  periodFrom: Date | null;
  periodTo: Date | null;
  timezone: string;
  modules: unknown;
  options: unknown;
  format: string;
  status: string;
  progress: unknown;
  fileSizeBytes: number | null;
  fileName: string | null;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  expiresAt: Date | null;
}): ExportJobSummary {
  const modules = Array.isArray(job.modules) ? (job.modules as string[]) : [];
  const options = { ...DEFAULT_EXPORT_OPTIONS, ...(job.options as Partial<ExportOptions> | null) };
  const progress = (job.progress as ExportProgress | null) ?? null;
  return {
    id: job.id,
    periodPreset: job.periodPreset,
    periodFrom: job.periodFrom?.toISOString() ?? null,
    periodTo: job.periodTo?.toISOString() ?? null,
    timezone: job.timezone,
    modules,
    options: { anonymize: options.anonymize === true, includeCase: options.includeCase === true },
    format: job.format as ExportJobSummary["format"],
    status: job.status,
    progress,
    fileSizeBytes: job.fileSizeBytes,
    fileName: job.fileName,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
  };
}

export class DataExportUseCases {
  /**
   * Módulos realmente disponíveis para o salão.
   *
   * Produtos/estoque somem para o segmento jurídico (mesmo gate da
   * importação); avaliações/fidelidade/indicações/vouchers somem para quem
   * tem publicidade restrita.
   */
  async availableModules(segment: BusinessSegment | null | undefined): Promise<ExportModuleKey[]> {
    const modules = EXPORT_MODULES.filter((module) => {
      if (module === "products" || module === "sales") {
        return isModuleEnabled(segment, "products");
      }
      if (module === "commissions") {
        return isModuleEnabled(segment, "commissions");
      }
      return true;
    });

    if (isAdvertisingRestricted(segment)) {
      const blocked: ExportModuleKey[] = ["reviews", "loyalty"];
      return modules.filter((module) => !blocked.includes(module));
    }
    return modules;
  }

  /** Cria o pedido (ou reaproveita um idêntico em andamento). */
  async create(input: CreateExportInput) {
    const shop = await prisma.barbershop.findUnique({
      where: { id: input.barbershopId },
      select: {
        timezone: true,
        businessSegment: true,
        name: true,
      },
    });
    if (!shop) throw new AppError("Estabelecimento não encontrado.", 404);

    const timezone = shop.timezone || "America/Sao_Paulo";
    const period = resolveExportPeriod(
      input.periodPreset,
      timezone,
      new Date(),
      input.dateFrom,
      input.dateTo,
    );

    const available = await this.availableModules(shop.businessSegment);
    const requested = this.resolveRequestedModules(input, available);

    if (requested.length === 0) {
      throw new AppError("Escolha pelo menos um módulo para exportar.", 400);
    }

    const options: ExportOptions = {
      anonymize: input.options?.anonymize === true,
      includeCase: input.options?.includeCase === true,
    };
    // Sigilo: caso/processo só sai com pedido explícito — e nunca em
    // segmento com publicidade restrita.
    if (!options.includeCase || isAdvertisingRestricted(shop.businessSegment)) {
      options.includeCase = false;
    }

    const format = input.format ?? "XLSX";

    // ── Idempotência: pedido idêntico em andamento ──────────────────────────
    const existing = await exportJobRepository.findActiveByIdempotencyKey(input.barbershopId, {
      periodPreset: period.preset,
      periodFrom: period.from,
      periodTo: period.to,
      modules: requested,
      format,
    });
    if (existing) {
      return toSummary(existing);
    }

    // ── Cotas ────────────────────────────────────────────────────────────────
    const active = await exportJobRepository.countActive(input.barbershopId);
    if (active >= MAX_ACTIVE_EXPORTS) {
      throw new AppError(
        "Já existe uma exportação em andamento neste estabelecimento. Aguarde a conclusão ou exclua o arquivo anterior.",
        409,
      );
    }
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await exportJobRepository.countRecent(input.barbershopId, since);
    if (recent >= maxExportsPerHour()) {
      throw new AppError(
        `Limite de ${maxExportsPerHour()} exportações por hora atingido. Tente novamente mais tarde.`,
        429,
      );
    }

    const job = await exportJobRepository.create({
      barbershopId: input.barbershopId,
      createdById: input.userId,
      periodPreset: period.preset,
      periodFrom: period.from,
      periodTo: period.to,
      timezone,
      modules: requested,
      options: options as unknown as Prisma.InputJsonValue,
      format,
      status: "PENDING",
    });

    return toSummary(job);
  }

  /** Módulos pedidos (preset > lista explícita > todos). */
  private resolveRequestedModules(
    input: CreateExportInput,
    available: ExportModuleKey[],
  ): ExportModuleKey[] {
    if (input.preset === "GERENTIAL") {
      return GERENTIAL_MODULES.filter((module) => available.includes(module));
    }
    if (input.preset === "BACKUP") {
      return [...available];
    }
    if (input.modules && input.modules.length > 0) {
      return input.modules.filter((module) => available.includes(module));
    }
    return [...available];
  }

  /** Detalhe de um job (com o período já resolvido). */
  async get(barbershopId: string, exportId: string) {
    const job = await exportJobRepository.findById(barbershopId, exportId);
    if (!job) throw new AppError("Exportação não encontrada.", 404);
    const summary = toSummary(job);
    const period = resolveExportPeriod(
      job.periodPreset as ExportPeriod["preset"],
      job.timezone,
      new Date(),
      job.periodFrom ? job.periodFrom.toISOString().slice(0, 10) : undefined,
      job.periodTo ? job.periodTo.toISOString().slice(0, 10) : undefined,
    );
    return { ...summary, periodLabel: period.label };
  }

  /** Histórico do salão. */
  async list(barbershopId: string) {
    const jobs = await exportJobRepository.list(barbershopId);
    return jobs.map(toSummary);
  }

  /** Job pronto para download (valida status e expiração). */
  async getDownloadable(barbershopId: string, exportId: string) {
    const job = await exportJobRepository.findById(barbershopId, exportId);
    if (!job) throw new AppError("Exportação não encontrada.", 404);
    if (job.status !== "COMPLETED" || !job.filePath) {
      throw new AppError("Esta exportação ainda não está pronta para download.", 409);
    }
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      throw new AppError("O link de download desta exportação expirou. Gere uma nova.", 410);
    }
    return job;
  }

  /** Exclui o arquivo (o histórico permanece, marcado como expirado). */
  async remove(barbershopId: string, exportId: string) {
    const job = await exportJobRepository.findById(barbershopId, exportId);
    if (!job) throw new AppError("Exportação não encontrada.", 404);
    const { deleteExportFile } = await import("./utils/exportTempFiles");
    await deleteExportFile(job.filePath);
    await exportJobRepository.markExpired(job.id);
    return { id: job.id, deleted: true };
  }
}

export const dataExportUseCases = new DataExportUseCases();
