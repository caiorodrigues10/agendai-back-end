import type { TrafficAggregateArea } from "../../domain/trafficAreas";

/** Totais de uma área no dia civil consolidado. */
export interface TrafficAreaSnapshot {
  /** Área local ou a linha agregada `all` do site inteiro. */
  area: TrafficAggregateArea;
  visits: number;
  visitors: number;
  sessions: number;
}

/** Totais de uma hora civil (0–23) e área. */
export interface TrafficHourSnapshot {
  hour: number;
  /** Área local ou a linha agregada `all` do site inteiro. */
  area: TrafficAggregateArea;
  visits: number;
  visitors: number;
}

/** Visitas por host de origem. O host nunca inclui path ou query. */
export interface TrafficOriginSnapshot {
  origin: string;
  visits: number;
}

/** Seção da página pública (profile/queue/appointments/products/other). */
export interface TrafficSalonSectionSnapshot {
  section: string;
  visits: number;
  visitors: number;
}

/** Totais de uma hora civil (0–23) de um alvo de atribuição. */
export interface TrafficSalonHourSnapshot {
  hour: number;
  visits: number;
  visitors: number;
}

/**
 * Totais de um alvo de atribuição (`b:<uuid>` salão / `o:<uuid>`
 * organização) no dia civil consolidado.
 */
export interface TrafficSalonSnapshot {
  target: string;
  visits: number;
  visitors: number;
  sections: TrafficSalonSectionSnapshot[];
  hours: TrafficSalonHourSnapshot[];
  origins: TrafficOriginSnapshot[];
}

/** Snapshot Redis de um dia civil completo. */
export interface TrafficDaySnapshot {
  day: string;
  areas: TrafficAreaSnapshot[];
  hours: TrafficHourSnapshot[];
  origins: TrafficOriginSnapshot[];
  /** Alvos de salão/organização com ping no dia (vazio quando não houve). */
  salons: TrafficSalonSnapshot[];
}

/** Porta de leitura do buffer Redis usado pela consolidação. */
export interface ITrafficConsolidationSource {
  readDay(dayKey: string): Promise<TrafficDaySnapshot>;
}
