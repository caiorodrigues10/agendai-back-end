import type { TrafficArea } from "../../domain/trafficAreas";

/** Totais de uma área no dia civil consolidado. */
export interface TrafficAreaSnapshot {
  area: TrafficArea;
  visits: number;
  visitors: number;
  sessions: number;
}

/** Totais de uma hora civil (0–23) e área. */
export interface TrafficHourSnapshot {
  hour: number;
  area: TrafficArea;
  visits: number;
  visitors: number;
}

/** Visitas por host de origem. O host nunca inclui path ou query. */
export interface TrafficOriginSnapshot {
  origin: string;
  visits: number;
}

/** Snapshot Redis de um dia civil completo. */
export interface TrafficDaySnapshot {
  day: string;
  areas: TrafficAreaSnapshot[];
  hours: TrafficHourSnapshot[];
  origins: TrafficOriginSnapshot[];
}

/** Porta de leitura do buffer Redis usado pela consolidação. */
export interface ITrafficConsolidationSource {
  readDay(dayKey: string): Promise<TrafficDaySnapshot>;
}
