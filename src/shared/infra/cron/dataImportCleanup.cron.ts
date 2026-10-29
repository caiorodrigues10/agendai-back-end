/**
 * Limpeza dos lotes de importação.
 *
 * - Lote que passou da janela de 30 dias vira EXPIRED (e para de bloquear
 *   novas importações do salão);
 * - arquivo temporário de lote concluído há mais de 7 dias é apagado;
 * - arquivo órfão no diretório temporário (processo caiu no meio) é removido.
 *
 * Roda uma vez por dia, de madrugada.
 */
import cron from "node-cron";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { spDateKey, withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";
import { getModuleLogger } from "@/shared/utils/logger";
import { ImportBatchRepository } from "@/modules/dataImport/repositories/ImportBatchRepository";
import { cleanupOldTempFiles, deleteTempFile } from "@/modules/dataImport/utils/tempFiles";

const logger = getModuleLogger("cron:data-import-cleanup");

/** Limpa lotes expirados e arquivos temporários. */
export async function cleanupDataImports(): Promise<{ expired: number; filesRemoved: number }> {
  const batches = new ImportBatchRepository();

  const expired = await batches.findPastUndoWindow(100);
  for (const batch of expired) {
    await batches.update(batch.id, batch.barbershopId, { status: "EXPIRED" });
    await deleteTempFile(batch.filePath);
  }

  const completed = await batches.findCompletedForFileCleanup(100);
  for (const batch of completed) {
    await deleteTempFile(batch.filePath);
  }

  const filesRemoved = await cleanupOldTempFiles(7);

  if (expired.length || filesRemoved) {
    logger.info(
      { expired: expired.length, filesRemoved },
      "Limpeza de importações concluída",
    );
  }

  return { expired: expired.length, filesRemoved };
}

/** Agenda o cron diário de limpeza. */
export function scheduleDataImportCleanup(log?: {
  info: (obj: any, msg?: string) => void;
  error: (err: any, msg?: string) => void;
}): void {
  const sink = log ?? logger;
  try {
    cron.schedule(
      "30 4 * * *",
      withCronCorrelation("data-import-cleanup", async () => {
        try {
          const scheduledKey = spDateKey();
          await withCronLock(
            getRedisConnection(),
            { jobName: "data-import-cleanup", scheduledKey },
            async () => {
              await cleanupDataImports();
            },
          );
        } catch (err) {
          sink.error({ err }, "Falha ao rodar limpeza de importações");
        }
      }),
      { timezone: "America/Sao_Paulo" },
    );
    sink.info("Cron de limpeza de importações agendado");
  } catch (err) {
    sink.error({ err }, "Não foi possível agendar o cron de limpeza de importações");
  }
}
