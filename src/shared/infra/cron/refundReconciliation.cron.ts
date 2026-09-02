import cron from "node-cron";
import { reconcilePendingRefunds } from "@/modules/payments/services/refundReconciliationService";

type CronLog = {
  info: (obj: unknown, message?: string) => void;
  error: (obj: unknown, message?: string) => void;
};

export function scheduleRefundReconciliation(log: CronLog): void {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const result = await reconcilePendingRefunds();
      if (result.reconciled || result.failed) {
        log.info(result, "Reconciliação de estornos concluída");
      }
    } catch (error) {
      log.error({ err: error }, "Falha no job de reconciliação de estornos");
    }
  }, { timezone: "America/Sao_Paulo" });
}

