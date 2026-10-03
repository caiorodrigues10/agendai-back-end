import cron from "node-cron";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";
import { DepositUseCases } from "../depositUseCases";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
};

export function scheduleDepositExpiration(log: CronLogger): void {
  try {
    cron.schedule(
      "* * * * *",
      withCronCorrelation("deposit-expiration", async () => {
        try {
          const now = new Date();
          const scheduledKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;

          await withCronLock(
            getRedisConnection(),
            { jobName: "deposit-expiration", scheduledKey, ttlMs: 90_000 },
            async () => {
              const useCases = new DepositUseCases();
              const result = await useCases.runDepositExpiration();
              if (result.expired > 0) {
                log.info(result, "Deposit expiration job completed");
              }
            }
          );
        } catch (err) {
          log.error({ err }, "Failed to run deposit expiration job");
        }
      }),
      { timezone: "America/Sao_Paulo" }
    );
    log.info("Deposit expiration cron scheduled (every minute)");
  } catch (err) {
    log.error?.({ err }, "Failed to schedule deposit expiration cron");
  }
}
