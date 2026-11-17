import { injectable } from "tsyringe";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import {
  TRAFFIC_AGGREGATE_AREAS,
  type TrafficAggregateArea,
} from "../domain/trafficAreas";
import { SALON_TRAFFIC_SECTIONS } from "../domain/salonTraffic";
import type {
  ITrafficConsolidationSource,
  TrafficAreaSnapshot,
  TrafficDaySnapshot,
  TrafficHourSnapshot,
  TrafficOriginSnapshot,
  TrafficSalonSnapshot,
} from "../application/ports/ITrafficConsolidationSource";
import * as keys from "./trafficKeys";

function nonNegativeInteger(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function pipelineValue(result: [Error | null, unknown] | undefined): string | null {
  if (!result) return null;
  const [error, value] = result;
  if (error) throw error;
  return value === null || value === undefined ? null : String(value);
}

/** Lê o snapshot Redis de um dia civil (America/Sao_Paulo). */
@injectable()
export class RedisTrafficConsolidationSource implements ITrafficConsolidationSource {
  async readDay(dayKey: string): Promise<TrafficDaySnapshot> {
    const client = getApiRedisConnection();

    const areas = await Promise.all(
      TRAFFIC_AGGREGATE_AREAS.map(async (area): Promise<TrafficAreaSnapshot> => {
        const [visits, visitors, sessions] = await Promise.all([
          client.get(keys.visitsKey(dayKey, area)),
          client.pfcount(keys.visitorsKey(dayKey, area)),
          client.get(keys.sessionCountKey(dayKey, area)),
        ]);
        return {
          area,
          visits: nonNegativeInteger(visits),
          visitors: nonNegativeInteger(String(visitors)),
          sessions: nonNegativeInteger(sessions),
        };
      }),
    );

    const hours: TrafficHourSnapshot[] = [];
    const hourPipeline = client.pipeline();
    for (const area of TRAFFIC_AGGREGATE_AREAS) {
      for (let hour = 0; hour < 24; hour += 1) {
        hourPipeline.get(keys.hourlyVisitsKey(dayKey, hour, area));
        hourPipeline.pfcount(keys.hourlyVisitorsKey(dayKey, hour, area));
      }
    }
    const hourResults = await hourPipeline.exec();
    let resultIndex = 0;
    for (const area of TRAFFIC_AGGREGATE_AREAS) {
      for (let hour = 0; hour < 24; hour += 1) {
        const visitCount = nonNegativeInteger(pipelineValue(hourResults?.[resultIndex]));
        const visitorCount = nonNegativeInteger(
          String(pipelineValue(hourResults?.[resultIndex + 1])),
        );
        resultIndex += 2;
        if (visitCount > 0 || visitorCount > 0) {
          hours.push({ hour, area, visits: visitCount, visitors: visitorCount });
        }
      }
    }

    const origins = await this.readOrigins(client, dayKey);
    const salons = await this.readSalons(client, dayKey);

    return { day: dayKey, areas, hours, origins, salons };
  }

  /**
   * Lê os contadores de salão/organização do dia.
   *
   * O registro `traffic:s:reg:{day}` diz quais alvos tiveram ping; cada alvo
   * tem visitas/visitantes (dia + hora), seções e hosts de origem. Nada de
   * IP/UA é lido aqui — só contadores e HLLs de hash diário.
   */
  private async readSalons(
    client: ReturnType<typeof getApiRedisConnection>,
    dayKey: string,
  ): Promise<TrafficSalonSnapshot[]> {
    const targets = await client.smembers(keys.salonRegistryKey(dayKey));
    if (targets.length === 0) return [];

    const snapshots: TrafficSalonSnapshot[] = [];
    for (const target of targets) {
      const [visits, visitors] = await Promise.all([
        client.get(keys.salonVisitsKey(dayKey, target)),
        client.pfcount(keys.salonVisitorsKey(dayKey, target)),
      ]);

      const sections = await Promise.all(
        SALON_TRAFFIC_SECTIONS.map(async (section) => {
          const [sectionVisits, sectionVisitors] = await Promise.all([
            client.get(keys.salonSectionVisitsKey(dayKey, target, section)),
            client.pfcount(keys.salonSectionVisitorsKey(dayKey, target, section)),
          ]);
          return {
            section,
            visits: nonNegativeInteger(sectionVisits),
            visitors: nonNegativeInteger(String(sectionVisitors)),
          };
        }),
      );

      const hours: TrafficSalonSnapshot["hours"] = [];
      const hourPipeline = client.pipeline();
      for (let hour = 0; hour < 24; hour += 1) {
        hourPipeline.get(keys.salonHourlyVisitsKey(dayKey, hour, target));
        hourPipeline.pfcount(keys.salonHourlyVisitorsKey(dayKey, hour, target));
      }
      const hourResults = await hourPipeline.exec();
      let resultIndex = 0;
      for (let hour = 0; hour < 24; hour += 1) {
        const hourVisits = nonNegativeInteger(pipelineValue(hourResults?.[resultIndex]));
        const hourVisitors = nonNegativeInteger(
          String(pipelineValue(hourResults?.[resultIndex + 1])),
        );
        resultIndex += 2;
        if (hourVisits > 0 || hourVisitors > 0) {
          hours.push({ hour, visits: hourVisits, visitors: hourVisitors });
        }
      }

      const origins = await this.readSalonOrigins(client, dayKey, target);

      snapshots.push({
        target,
        visits: nonNegativeInteger(visits),
        visitors: nonNegativeInteger(String(visitors)),
        sections,
        hours,
        origins,
      });
    }
    return snapshots;
  }

  private async readSalonOrigins(
    client: ReturnType<typeof getApiRedisConnection>,
    dayKey: string,
    target: string,
  ): Promise<TrafficOriginSnapshot[]> {
    const hosts = await client.smembers(keys.salonOriginRegistryKey(dayKey, target));
    if (hosts.length === 0) return [];

    const values = await client.mget(
      ...hosts.map((host) => keys.salonOriginKey(dayKey, target, host)),
    );

    return hosts.map((origin, index) => ({
      origin,
      visits: nonNegativeInteger(values[index] ?? null),
    }));
  }

  private async readOrigins(
    client: ReturnType<typeof getApiRedisConnection>,
    dayKey: string,
  ): Promise<TrafficOriginSnapshot[]> {
    const hosts = await client.smembers(keys.originRegistryKey(dayKey));
    if (hosts.length === 0) return [];

    const values = await client.mget(
      ...hosts.map((host) => keys.originKey(dayKey, host)),
    );

    return hosts.map((origin, index) => ({
      origin,
      visits: nonNegativeInteger(values[index] ?? null),
    }));
  }
}

export type { TrafficAggregateArea };
