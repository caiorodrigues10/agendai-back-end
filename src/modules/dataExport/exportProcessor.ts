/**
 * Processor da exportação — o que o worker da fila `data-export` executa.
 *
 * Fluxo: marca o job como PROCESSING → monta o contexto (período, salão,
 * opções) → gera o arquivo → grava o resultado (caminho, tamanho, expiração).
 *
 * Todas as consultas rodam dentro de `requestContext.run({ barbershopId })`
 * para que a RLS do tenant filtre pelo salão do job.
 */
import { stat } from "node:fs/promises";
import { prisma } from "@/libs/prismaClient";
import { requestContext } from "@/shared/infra/http/requestContext";
import { getModuleLogger } from "@/shared/utils/logger";
import { exportJobRepository } from "./repositories/ExportJobRepository";
import { buildExportFile } from "./builders/workbookBuilder";
import { resolveExportPeriod, previousExportPeriod } from "./utils/exportPeriod";
import { deleteExportFile } from "./utils/exportTempFiles";
import { EXPORT_FILE_RETENTION_HOURS } from "./dataExport.constants";
import type { ExportModuleKey, ExportOptions, ExportProgress } from "./dataExport.types";

const logger = getModuleLogger("dataExport:processor");

/** Gera o arquivo de um pedido de exportação. */
export async function processExportJob(
  exportId: string,
  barbershopId: string,
): Promise<{ fileName: string; fileSizeBytes: number }> {
  const job = await exportJobRepository.findById(barbershopId, exportId);
  if (!job) {
    logger.warn({ exportId }, "Pedido de exportação não encontrado");
    throw new Error("Pedido de exportação não encontrado.");
  }
  if (job.status === "COMPLETED") {
    return { fileName: job.fileName ?? "", fileSizeBytes: job.fileSizeBytes ?? 0 };
  }

  await exportJobRepository.markProcessing(job.id);

  try {
    const period = resolveExportPeriod(
      job.periodPreset as never,
      job.timezone,
      new Date(),
      job.periodFrom ? job.periodFrom.toISOString().slice(0, 10) : undefined,
      job.periodTo ? job.periodTo.toISOString().slice(0, 10) : undefined,
    );
    const previous = previousExportPeriod(period);
    const modules = (Array.isArray(job.modules) ? job.modules : []) as ExportModuleKey[];
    const options = {
      anonymize: (job.options as Partial<ExportOptions> | null)?.anonymize === true,
      includeCase: (job.options as Partial<ExportOptions> | null)?.includeCase === true,
    };
    const generatedAt = new Date();

    const result = await requestContext.run({ barbershopId }, () =>
      buildExportFile({
        exportId: job.id,
        barbershopId,
        modules,
        format: job.format,
        period: {
          preset: period.preset,
          from: period.from,
          to: period.to,
          label: period.label,
          timezone: period.timezone,
        },
        previousPeriod: previous
          ? {
              from: previous.from,
              to: previous.to,
              label: previous.label,
            }
          : null,
        options,
        generatedAt,
        onProgress: async (progress: ExportProgress) => {
          await exportJobRepository.updateProgress(job.id, progress as unknown as object);
        },
      }),
    );

    const expiresAt = new Date(
      Date.now() + EXPORT_FILE_RETENTION_HOURS * 60 * 60 * 1000,
    );
    await exportJobRepository.markCompleted(job.id, {
      filePath: result.filePath,
      fileName: result.fileName,
      fileSizeBytes: result.fileSizeBytes,
      expiresAt,
    });

    logger.info(
      { exportId: job.id, barbershopId, fileName: result.fileName, bytes: result.fileSizeBytes },
      "Exportação concluída",
    );

    return { fileName: result.fileName, fileSizeBytes: result.fileSizeBytes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, exportId: job.id, barbershopId }, "Falha ao gerar exportação");
    await exportJobRepository.markFailed(job.id, message);
    // Arquivo parcial não fica órfão.
    const partial = await prisma.exportJob.findUnique({
      where: { id: job.id },
      select: { filePath: true },
    });
    await deleteExportFile(partial?.filePath);
    throw error;
  }
}

/** Tamanho do arquivo (usado pelo health check). */
export async function exportFileSize(path: string): Promise<number> {
  const info = await stat(path);
  return info.size;
}
