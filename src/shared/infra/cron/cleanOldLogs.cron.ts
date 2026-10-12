import cron from "node-cron";
import { prisma } from "@/libs/prismaClient";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { spDateKey, withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";

const RETENTION_MONTHS = 6;
const BATCH_SIZE = 1000;
const ALLOWED_TABLES = new Set<string>(["audit_logs", "access_logs", "error_logs"]);

export const LOG_COLUMNS = {
  audit_logs: '"createdAt"',
  access_logs: '"createdAt"',
  error_logs: '"createdAt"',
} as const satisfies Record<string, string>;
export function buildCleanTableSql(tableName: keyof typeof LOG_COLUMNS): string {
  const column = LOG_COLUMNS[tableName];
  return `DELETE FROM ${tableName} WHERE id IN (SELECT id FROM ${tableName} WHERE ${column} < $1 LIMIT ${BATCH_SIZE})`;
}

export async function cleanTable(tableName: string): Promise<number> {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Tabela não permitida: ${tableName}`);
  }
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  let totalDeleted = 0;
  let deleted = BATCH_SIZE;

  while (deleted === BATCH_SIZE) {
    const result = await prisma.$executeRawUnsafe(
      buildCleanTableSql(tableName as keyof typeof LOG_COLUMNS),
      cutoff
    );
    deleted = Number(result);
    totalDeleted += deleted;
  }

  return totalDeleted;
}

type CleanOldLogsLog = {
  info: (msg: any) => void;
  error: (err: any, msg: string) => void;
  warn?: (msg: any) => void;
};

export function scheduleCleanOldLogs(log?: CleanOldLogsLog) {
  cron.schedule(
    "0 3 * * *",
    withCronCorrelation("clean-old-logs", async () => {
      try {
        const scheduledKey = spDateKey();
        await withCronLock(
          getRedisConnection(),
          { jobName: "clean-old-logs", scheduledKey },
          async (ctx) => {
            const sink = log ?? console;
            const stillLocked = () => {
              if (ctx.isLockHeld()) return true;
              sink.warn?.("[CleanOldLogs] Lock de cron perdido — limpeza interrompida");
              return false;
            };
            const audit = await cleanTable("audit_logs");
            if (!stillLocked()) return;
            const access = await cleanTable("access_logs");
            if (!stillLocked()) return;
            const errors = await cleanTable("error_logs");
            if (!stillLocked()) return;
            const notificationPayloads = await prisma.notificationOutbox.deleteMany({
              where: { purgeAfter: { lte: new Date() } },
            });
            const total = audit + access + errors;
            if (total > 0) {
              sink.info(`[CleanOldLogs] Removed ${total} old log records (audit=${audit}, access=${access}, error=${errors})`);
            }
            if (notificationPayloads.count > 0) {
              sink.info(`[CleanOldLogs] Removed ${notificationPayloads.count} expired encrypted notification payloads`);
            }
          }
        );
      } catch (err) {
        (log ?? console).error(err, "[CleanOldLogs] Failed to clean old logs");
      }
    }),
    { timezone: "America/Sao_Paulo" }
  );
  (log ?? console).info("[CleanOldLogs] Cron de limpeza de logs (LGPD) agendado");
}
