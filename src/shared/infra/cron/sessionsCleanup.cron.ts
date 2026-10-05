import cron from "node-cron";
import { prisma, Prisma } from "@/libs/prismaClient";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { withCronLock } from "@/shared/infra/redis/cronLock";

const EXPIRED_RETENTION_DAYS = 30;
const REVOKED_RETENTION_DAYS = 90;
const BATCH_SIZE = 1000;
const MS_PER_DAY = 86_400_000;

type CronLog = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/**
 * Limpa histórico de sessões mortas:
 * - expiradas há mais de 30 dias e nunca revogadas;
 * - revogadas há mais de 90 dias (janela maior p/ auditoria).
 * Só limpeza de histórico — nunca mexe em sessões ativas.
 * Lock Redis + CronRun evitam execução duplicada com réplicas.
 */
export function scheduleSessionsCleanup(log?: CronLog) {
  cron.schedule(
    "40 3 * * *",
    async () => {
      try {
        const scheduledKey = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
        }).format(new Date());

        await withCronLock(getRedisConnection(), { jobName: "sessions-cleanup", scheduledKey }, async () => {
          const now = Date.now();
          const expiredCutoff = new Date(now - EXPIRED_RETENTION_DAYS * MS_PER_DAY);
          const revokedCutoff = new Date(now - REVOKED_RETENTION_DAYS * MS_PER_DAY);
          const where: Prisma.UserSessionWhereInput = {
            OR: [
              { expiresAt: { lt: expiredCutoff }, revokedAt: null },
              { revokedAt: { lt: revokedCutoff } },
            ],
          };

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

          (log ?? console).info({ removed: total }, "[SessionsCleanup] Old user sessions removed");
        });
      } catch (err) {
        (log ?? console).error(err, "[SessionsCleanup] Failed to clean old sessions");
      }
    },
    { timezone: "America/Sao_Paulo" },
  );
  (log ?? console).info("[SessionsCleanup] Cron de limpeza de sessões agendado");
}
