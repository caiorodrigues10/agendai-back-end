import cron from "node-cron";
import { prisma } from "@/libs/prismaClient";

const RETENTION_DAYS = 30;
const BATCH_SIZE = 1000;
const MS_PER_DAY = 86_400_000;

type CronLog = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/**
 * Remove sessões mortas com mais de 30 dias (expiradas ou já revogadas).
 * Só limpeza de histórico — nunca mexe em sessões ativas.
 */
export function scheduleSessionsCleanup(log?: CronLog) {
  cron.schedule(
    "40 3 * * *",
    async () => {
      try {
        const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);
        const where = {
          OR: [
            { expiresAt: { lt: cutoff } },
            { revokedAt: { not: null, lt: cutoff } },
          ],
        } as const;

        let total = 0;
        let deleted = BATCH_SIZE;
        while (deleted === BATCH_SIZE) {
          const rows = await prisma.userSession.findMany({
            where,
            select: { id: true },
            take: BATCH_SIZE,
          });
          if (rows.length === 0) break;
          const result = await prisma.userSession.deleteMany({
            where: { id: { in: rows.map((row: { id: string }) => row.id) } },
          });
          deleted = result.count;
          total += deleted;
        }

        if (total > 0) {
          (log ?? console).info(`[SessionsCleanup] Removed ${total} old user sessions`);
        }
      } catch (err) {
        (log ?? console).error(err, "[SessionsCleanup] Failed to clean old sessions");
      }
    },
    { timezone: "America/Sao_Paulo" },
  );
  (log ?? console).info("[SessionsCleanup] Cron de limpeza de sessões agendado");
}
