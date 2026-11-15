import cron from "node-cron";
import { container } from "tsyringe";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { spSlotKey, withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";
import { getModuleLogger } from "@/shared/utils/logger";
import { addDays, spDayKey } from "../domain/periodWindows";
import {
  ConsolidateTrafficUseCase,
  TRAFFIC_CONSOLIDATION_SOURCE,
} from "../application/useCases/ConsolidateTrafficUseCase";

const logger = getModuleLogger("cron:traffic-consolidation");

/**
 * Consolida o dia civil anterior.
 *
 * Rodar de hora em hora permite recuperar o dia se o Redis estiver indisponível
 * em uma janela. O lock distribuído impede duplicidade entre réplicas; a
 * persistência usa GREATEST, portanto repetir a consolidação é seguro.
 */
export async function consolidatePreviousTrafficDay(now: Date = new Date()): Promise<string> {
  const dayKey = addDays(spDayKey(now), -1);
  const useCase = container.resolve(ConsolidateTrafficUseCase);
  const result = await useCase.execute(dayKey);
  logger.info({ ...result }, "Tráfego do dia anterior consolidado");
  return result.day;
}

/** Agenda a consolidação horária do dia anterior. */
export function scheduleTrafficConsolidation(log?: {
  info: (obj: unknown, msg?: string) => void;
  error: (err: unknown, msg?: string) => void;
}): void {
  const sink = log ?? logger;
  try {
    cron.schedule(
      "5 * * * *",
      withCronCorrelation("traffic-consolidation", async () => {
        try {
          const now = new Date();
          await withCronLock(
            getRedisConnection(),
            { jobName: "traffic-consolidation", scheduledKey: spSlotKey(60, now) },
            async () => {
              await consolidatePreviousTrafficDay(now);
            },
          );
        } catch (err) {
          sink.error({ err }, "Falha ao consolidar tráfego do dia anterior");
        }
      }),
      { timezone: "America/Sao_Paulo" },
    );
    sink.info("Cron de consolidação de tráfego agendado");
  } catch (err) {
    sink.error({ err }, "Não foi possível agendar o cron de consolidação de tráfego");
  }
}

// Mantém o token exportado acessível para testes de composição do container.
export { TRAFFIC_CONSOLIDATION_SOURCE };
