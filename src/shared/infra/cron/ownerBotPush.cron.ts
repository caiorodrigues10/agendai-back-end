import cron from "node-cron";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";
import { runOwnerBotPushes } from "@/modules/whatsappOwnerBot/ownerBotPush";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  warn?: (obj: object | string, msg?: string) => void;
};

/**
 * Push proativo do assistente (briefing de manhã, resumo de noite).
 * Sobe a cada minuto; a hora real é a do fuso do salão e a deduplicação
 * por dia (lastBriefingAt/lastSummaryAt) torna a varredura inócua.
 */
export function scheduleOwnerBotPush(log: CronLogger): void {
  try {
    cron.schedule(
      "* * * * *",
      withCronCorrelation("owner-bot-push", async () => {
        try {
          const now = new Date();
          const scheduledKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;

          await withCronLock(
            getRedisConnection(),
            { jobName: "owner-bot-push", scheduledKey, ttlMs: 90_000 },
            async () => {
              const report = await runOwnerBotPushes();
              if (report.briefing > 0 || report.summary > 0) {
                log.info(report, "Pushes do assistente processados");
              }
            }
          );
        } catch (err) {
          log.error({ err }, "Falha ao rodar cron de push do assistente");
        }
      }),
      { timezone: "America/Sao_Paulo" }
    );
    log.info({ schedule: "* * * * *" }, "Cron de push do assistente agendado (a cada minuto)");
  } catch (err) {
    log.error?.({ err }, "Não foi possível agendar cron de push do assistente");
  }
}
