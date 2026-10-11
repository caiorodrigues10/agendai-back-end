import cron from "node-cron";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";
import { runLateAppointmentAlerts } from "@/modules/appointments/useCases/notifyLate/NotifyLateAppointmentsUseCase";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  warn?: (obj: object | string, msg?: string) => void;
};

/**
 * Alerta de clientes atrasados (L1/L2/L3) — cliente + dono via WhatsApp.
 * Sobe a cada minuto; a cadência real por agendamento vem do nível e da chave
 * de deduplicação (varredura repetida é inócua).
 */
export function scheduleLateAppointmentsAlert(log: CronLogger): void {
  try {
    cron.schedule(
      "* * * * *",
      withCronCorrelation("late-appointments-alert", async () => {
        try {
          const now = new Date();
          const scheduledKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;

          await withCronLock(
            getRedisConnection(),
            { jobName: "late-appointments-alert", scheduledKey, ttlMs: 90_000 },
            async () => {
              const report = await runLateAppointmentAlerts();
              if (report.sent > 0 || report.failed > 0) {
                log.info(report, "Alertas de atraso processados");
              }
            }
          );
        } catch (err) {
          log.error({ err }, "Falha ao rodar cron de alertas de atraso");
        }
      }),
      { timezone: "America/Sao_Paulo" }
    );
    log.info({ schedule: "* * * * *" }, "Cron de alertas de atraso agendado (a cada minuto)");
  } catch (err) {
    log.error?.({ err }, "Não foi possível agendar cron de alertas de atraso");
  }
}
