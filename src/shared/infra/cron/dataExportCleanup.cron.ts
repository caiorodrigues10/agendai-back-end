/**
 * Limpeza das exportações de planilha.
 *
 * - Pedido concluído com o link expirado vira EXPIRED (e o arquivo é apagado);
 * - arquivo órfão no diretório temporário (processo caiu no meio) é removido.
 *
 * Roda uma vez por dia, de madrugada.
 */
import cron from "node-cron";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { spDateKey, withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";
import { getModuleLogger } from "@/shared/utils/logger";
import { exportJobRepository } from "@/modules/dataExport/repositories/ExportJobRepository";
import { cleanupOldExportFiles, deleteExportFile } from "@/modules/dataExport/utils/exportTempFiles";
import { EXPORT_FILE_RETENTION_HOURS } from "@/modules/dataExport/dataExport.constants";

const logger = getModuleLogger("cron:data-export-cleanup");

/** Limpa exportações expiradas e arquivos temporários. */
export async function cleanupDataExports(): Promise<{ expired: number; filesRemoved: number }> {
  const expired = await exportJobRepository.findExpiredCandidates(new Date());
  for (const job of expired) {
    await deleteExportFile(job.filePath);
    await exportJobRepository.markExpired(job.id);
  }

  const filesRemoved = await cleanupOldExportFiles(EXPORT_FILE_RETENTION_HOURS);

  if (expired.length || filesRemoved) {
    logger.info(
      { expired: expired.length, filesRemoved },
      "Limpeza de exportações concluída",
    );
  }

  return { expired: expired.length, filesRemoved };
}

/** Agenda o cron diário de limpeza. */
export function scheduleDataExportCleanup(log?: {
  info: (obj: any, msg?: string) => void;
  error: (err: any, msg?: string) => void;
}): void {
  const sink = log ?? logger;
  try {
    cron.schedule(
      "45 4 * * *",
      withCronCorrelation("data-export-cleanup", async () => {
        try {
          const scheduledKey = spDateKey();
          await withCronLock(
            getRedisConnection(),
            { jobName: "data-export-cleanup", scheduledKey },
            async () => {
              await cleanupDataExports();
            },
          );
        } catch (err) {
          sink.error({ err }, "Falha ao rodar limpeza de exportações");
        }
      }),
      { timezone: "America/Sao_Paulo" },
    );
    sink.info("Cron de limpeza de exportações agendado");
  } catch (err) {
    sink.error({ err }, "Não foi possível agendar o cron de limpeza de exportações");
  }
}
