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
 * Consolida o dia civil anterior e o dia civil corrente (parcial).
 *
 * Rodar de hora em hora permite recuperar o dia anterior se o Redis estiver
 * indisponível em uma janela e mantém o dia corrente visível no relatório.
 * O lock distribuído impede duplicidade entre réplicas; a persistência usa
 * GREATEST, portanto repetir a consolidação é seguro.
 */
export async function consolidateTrafficDays(now: Date = new Date()): Promise<string[]> {
  const today = spDayKey(now);
  const dayKeys = [addDays(today, -1), today];
  const useCase = container.resolve(ConsolidateTrafficUseCase);
  const consolidated: string[] = [];
  let firstError: unknown;

  for (const dayKey of dayKeys) {
    try {
      const result = await useCase.execute(dayKey);
      consolidated.push(result.day);
      logger.info({ ...result }, "Tráfego civil consolidado");
    } catch (error) {
      // Tenta os dois dias mesmo quando um deles falha; o próximo tick
      // recupera o dia ausente sem esconder a falha do cron.
      firstError ??= error;
    }
  }

  if (firstError) throw firstError;
  return consolidated;
}

/**
 * Consolida somente o dia civil anterior.
 *
 * Mantido como operação unitária para jobs/reprocessamento pontual; o cron
 * periódico usa `consolidateTrafficDays` para incluir também o dia parcial.
 */
export async function consolidatePreviousTrafficDay(now: Date = new Date()): Promise<string> {
  const dayKey = addDays(spDayKey(now), -1);
  const useCase = container.resolve(ConsolidateTrafficUseCase);
  const result = await useCase.execute(dayKey);
  logger.info({ ...result }, "Tráfego do dia anterior consolidado");
  return result.day;
}

/** Agenda a consolidação horária do dia anterior e do dia corrente parcial. */
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
              await consolidateTrafficDays(now);
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
