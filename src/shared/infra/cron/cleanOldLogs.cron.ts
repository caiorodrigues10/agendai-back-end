import cron from "node-cron";
import { prisma } from "@/libs/prismaClient";

const RETENTION_MONTHS = 6;
const BATCH_SIZE = 1000;
const ALLOWED_TABLES = new Set(["audit_logs", "access_logs", "error_logs"]);

async function cleanTable(tableName: string): Promise<number> {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Tabela não permitida: ${tableName}`);
  }
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  let totalDeleted = 0;
  let deleted = BATCH_SIZE;

  while (deleted === BATCH_SIZE) {
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM ${tableName} WHERE id IN (SELECT id FROM ${tableName} WHERE created_at < $1 LIMIT ${BATCH_SIZE})`,
      cutoff
    );
    deleted = Number(result);
    totalDeleted += deleted;
  }

  return totalDeleted;
}

export function scheduleCleanOldLogs(log?: { info: (msg: any) => void; error: (err: any, msg: string) => void }) {
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        const audit = await cleanTable("audit_logs");
        const access = await cleanTable("access_logs");
        const errors = await cleanTable("error_logs");
        const total = audit + access + errors;
        if (total > 0) {
          (log ?? console).info(`[CleanOldLogs] Removed ${total} old log records (audit=${audit}, access=${access}, error=${errors})`);
        }
      } catch (err) {
        (log ?? console).error(err, "[CleanOldLogs] Failed to clean old logs");
      }
    },
    { timezone: "America/Sao_Paulo" }
  );
  (log ?? console).info("[CleanOldLogs] Cron de limpeza de logs (LGPD) agendado");
}
