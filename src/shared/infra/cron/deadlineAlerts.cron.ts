import cron from "node-cron";
import { container } from "tsyringe";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";
import { RunDeadlineAlertsUseCase } from "@/modules/cases/useCases/deadlineAlertUseCases";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  warn?: (obj: object | string, msg?: string) => void;
};

/**
 * Alertas de vencimento de prazo do escritório (segmento LAW_FIRM).
 *
 * Roda uma vez por dia (08:00, horário de Brasília): varre os prazos
 * pendentes e avisa o dono por WhatsApp quando o prazo vence em até 3 dias
 * úteis ou já venceu. A deduplicação é por (prazo, destinatário, tipo,
 * canal, dia) — a tabela tem índice único, então a varredura é idempotente.
 */
export function scheduleDeadlineAlerts(log: CronLogger): void {
  try {
    cron.schedule(
      "0 8 * * *",
      withCronCorrelation("deadline-alerts", async () => {
        try {
          const now = new Date();
          const scheduledKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

          await withCronLock(
            getRedisConnection(),
            { jobName: "deadline-alerts", scheduledKey, ttlMs: 3_600_000 },
            async () => {
              const useCase = container.resolve(RunDeadlineAlertsUseCase);
              const report = await useCase.execute();
              if (report.created > 0 || report.failed > 0) {
                log.info(report, "Alertas de prazo processados");
              }
            }
          );
        } catch (err) {
          log.error({ err }, "Falha ao rodar cron de alertas de prazo");
        }
      }),
      { timezone: "America/Sao_Paulo" }
    );
    log.info({ schedule: "0 8 * * *" }, "Cron de alertas de prazo agendado (diário 08:00)");
  } catch (err) {
    log.error?.({ err }, "Não foi possível agendar cron de alertas de prazo");
  }
}
