import { inject, injectable } from "tsyringe";
import {
  evaluateBeaconRequest,
  type BeaconRequestMetadata,
} from "../../domain/beaconRequest";
import { spDayKey, spHour } from "../../domain/periodWindows";
import type { TrafficArea } from "../../domain/trafficAreas";
import { incrementRedisUnavailableDrop } from "../../lossCounters";
import type { ITrafficCounter } from "../ports/ITrafficCounter";

export const TRAFFIC_COUNTER = "TrafficCounter";

/** Everything the controller extracts from the incoming beacon request. */
export interface RecordVisitRequest extends BeaconRequestMetadata {}

export type RecordVisitResult =
  | { counted: true; area: TrafficArea }
  | { counted: false; reason: "disabled" | "excluded" | "rate_limited" | "counter_error" };

/**
 * Ingest one anonymous page-view beacon.
 *
 * Order matters: cheap request-level exclusions run before any Redis work,
 * so bots/opt-outs/master-panel traffic never even hashes an identity. Every
 * failure mode resolves to `{ counted: false }` — the HTTP answer is always
 * 204 and no request data is ever logged.
 */
@injectable()
export class RecordVisitUseCase {
  constructor(@inject(TRAFFIC_COUNTER) private readonly counter: ITrafficCounter) {}

  async execute(request: RecordVisitRequest, now: Date = new Date()): Promise<RecordVisitResult> {
    const decision = evaluateBeaconRequest(request);
    if (!decision.accepted) return { counted: false, reason: decision.reason };

    try {
      const allowed = await this.counter.consumeRateLimit(request.ip);
      if (!allowed) return { counted: false, reason: "rate_limited" };

      await this.counter.recordVisit({
        area: decision.area,
        ip: request.ip,
        userAgent: request.userAgent ?? "",
        dayKey: spDayKey(now),
        hour: spHour(now),
        originHost: decision.originHost,
      });
      return { counted: true, area: decision.area };
    } catch {
      // Redis unavailable (or any counter failure): accepted loss + metric.
      incrementRedisUnavailableDrop();
      return { counted: false, reason: "counter_error" };
    }
  }
}
