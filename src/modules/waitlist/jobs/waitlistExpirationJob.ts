import cron from "node-cron";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";
import { WaitlistUseCases } from "../waitlistUseCases";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
};

export function scheduleWaitlistExpiration(log: CronLogger): void {
  try {
    cron.schedule(
      "*/5 * * * *",
      withCronCorrelation("waitlist-expiration", async () => {
        try {
          const now = new Date();
          const scheduledKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}-${String(Math.floor(now.getMinutes() / 5)).padStart(2, "0")}`;

          await withCronLock(
            getRedisConnection(),
            { jobName: "waitlist-expiration", scheduledKey, ttlMs: 240_000 },
            async () => {
              const useCases = new WaitlistUseCases();
              const result = await useCases.runWaitlistExpiration();
              if (result.expired > 0) {
                log.info(result, "Waitlist expiration job completed");
              }
            }
          );
        } catch (err) {
          log.error({ err }, "Failed to run waitlist expiration job");
        }
      }),
      { timezone: "America/Sao_Paulo" }
    );
    log.info("Waitlist expiration cron scheduled (every 5 minutes)");
  } catch (err) {
    log.error?.({ err }, "Failed to schedule waitlist expiration cron");
  }
}
