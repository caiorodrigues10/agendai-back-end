import { injectable } from "tsyringe";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { TRAFFIC_AREAS, type TrafficArea } from "../domain/trafficAreas";
import type {
  ITrafficConsolidationSource,
  TrafficAreaSnapshot,
  TrafficDaySnapshot,
  TrafficHourSnapshot,
  TrafficOriginSnapshot,
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
      TRAFFIC_AREAS.map(async (area): Promise<TrafficAreaSnapshot> => {
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
    for (const area of TRAFFIC_AREAS) {
      for (let hour = 0; hour < 24; hour += 1) {
        hourPipeline.get(keys.hourlyVisitsKey(dayKey, hour, area));
        hourPipeline.pfcount(keys.hourlyVisitorsKey(dayKey, hour, area));
      }
    }
    const hourResults = await hourPipeline.exec();
    let resultIndex = 0;
    for (const area of TRAFFIC_AREAS) {
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

    return { day: dayKey, areas, hours, origins };
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

export type { TrafficArea };
