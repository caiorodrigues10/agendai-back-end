import type { TrafficDaySnapshot } from "./ITrafficConsolidationSource";

/** Resultado persistido da consolidação de um dia. */
export interface TrafficConsolidationResult {
  day: string;
  areas: number;
  hours: number;
  origins: number;
  /** Alvos de salão/organização consolidados no dia. */
  salons: number;
}

/**
 * Porta de persistência da consolidação.
 *
 * A implementação deve preservar o maior valor já persistido (GREATEST) e
 * registrar uma regressão do Redis na métrica de perda.
 */
export interface ITrafficConsolidationRepository {
  persistDay(snapshot: TrafficDaySnapshot): Promise<TrafficConsolidationResult>;
  /**
   * Apaga agregados anteriores ao dia civil informado (retenção).
   * @returns quantidade de linhas removidas.
   */
  purgeOlderThan(cutoffDayKey: string): Promise<number>;
}
