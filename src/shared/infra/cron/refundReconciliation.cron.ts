import cron from "node-cron";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { spSlotKey, withCronLock } from "@/shared/infra/redis/cronLock";
import { reconcilePendingRefunds } from "@/modules/payments/services/refundReconciliationService";
import { withCronCorrelation } from "@/shared/utils/correlationContext";

type CronLog = {
  info: (obj: unknown, message?: string) => void;
  error: (obj: unknown, message?: string) => void;
  warn?: (obj: unknown, message?: string) => void;
};

export function scheduleRefundReconciliation(log: CronLog): void {
  cron.schedule("*/5 * * * *", withCronCorrelation("refund-reconciliation", async () => {
    try {
      const scheduledKey = spSlotKey(5);
      await withCronLock(
        getRedisConnection(),
        { jobName: "refund-reconciliation", scheduledKey, ttlMs: 240_000 },
        async (ctx) => {
          if (!ctx.isLockHeld()) {
            log.warn?.({}, "Lock de cron perdido antes da reconciliação — execução interrompida");
            return;
          }
          const result = await reconcilePendingRefunds();
          if (result.reconciled || result.failed) {
            log.info(result, "Reconciliação de estornos concluída");
          }
        }
      );
    } catch (error) {
      log.error({ err: error }, "Falha no job de reconciliação de estornos");
    }
  }), { timezone: "America/Sao_Paulo" });
}
