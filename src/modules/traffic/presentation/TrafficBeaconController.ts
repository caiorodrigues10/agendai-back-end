import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { RecordVisitUseCase } from "../application/useCases/RecordVisitUseCase";
import { RecordSalonTrafficUseCase } from "../application/useCases/RecordSalonTrafficUseCase";
import { trafficBeaconEnabled, trafficExtraIgnoreHosts } from "../trafficConfig";
import { DEFAULT_IGNORED_HOSTS } from "../domain/trafficExclusions";
import {
  hasSalonAttribution,
  trafficBeaconBodySchema,
  type TrafficBeaconBody,
} from "../schemas/trafficSchemas";
import type { SalonTrafficRoute } from "../domain/salonTraffic";

/**
 * Presentation for the anonymous beacon (`POST /api/ping`).
 *
 * Privacy contract:
 *   - the answer is ALWAYS 204, whatever happens (disabled, excluded, Redis
 *     down, malformed body) — a beacon must never surface an error page;
 *   - the answer is the same for an existing and a non-existing salon — no
 *     enumeration of public ids;
 *   - no request data (path, referrer, IP, UA) is ever logged: the only
 *     observability is the reason enum returned for metrics;
 *   - query strings / fragments / route ids are dropped during area
 *     classification and never reach a counter or the database.
 *
 * Two payload paths:
 *   - global (marketing/intention): `{p, r?}`;
 *   - salon (public salon pages): `{p, salon, salonType, kind, tab?, r?}`.
 */
export class TrafficBeaconController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const result = await this.record(request);
    // `reason` is a closed enum (no request content) — safe to log.
    if (!result.counted) {
      request.log.debug({ reason: result.reason }, "traffic beacon discarded");
    }
    return reply.status(204).send();
  }

  /** Extract + classify. Exposed separately for tests. */
  private async record(request: FastifyRequest): Promise<
    | { counted: true; area: string }
    | { counted: false; reason: string }
  > {
    const body = parseBeaconBody(request.body);
    if (!body) return { counted: false, reason: "excluded" };

    const metadata = {
      path: body.p ?? "/",
      referrer: body.r,
      ip: request.ip,
      userAgent: headerValue(request.headers["user-agent"]),
      headers: request.headers as Record<string, unknown>,
      origin: headerValue(request.headers.origin),
      allowedOrigins: allowedOriginList(),
      ignoreHosts: [...DEFAULT_IGNORED_HOSTS, ...trafficExtraIgnoreHosts()],
      enabled: trafficBeaconEnabled(),
    };

    if (hasSalonAttribution(body)) {
      // O schema já garantiu a coerência (salon/salonType/kind + rota) e
      // sanitizeu `tab` (fora da allowlist → ausente).
      const useCase = container.resolve(RecordSalonTrafficUseCase);
      return useCase.execute({
        ...metadata,
        salon: {
          route: body.p as SalonTrafficRoute,
          salon: body.salon as string,
          salonType: body.salonType as "id" | "slug",
          kind: body.kind as "visit" | "tab",
          tab: body.tab,
        },
      });
    }

    const useCase = container.resolve(RecordVisitUseCase);
    return useCase.execute(metadata);
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * ALLOWED_ORIGINS — the same list that backs CORS (`corsOptions.ts`).
 * Kept as a function so tests can flip the env between cases.
 */
function allowedOriginList(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The beacon ships `Content-Type: text/plain` to skip the CORS preflight, so
 * the body arrives as a raw string. Both accepted shapes (JSON and
 * `p=…&r=…` pairs) are parsed here; anything else is dropped.
 *
 * The parsed (and stripped) payload is returned — unknown fields are removed
 * by zod and never reach a counter.
 */
function parseBeaconBody(raw: unknown): TrafficBeaconBody | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const result = trafficBeaconBodySchema.safeParse(raw);
    return result.success ? result.data : null;
  }
  if (typeof raw !== "string" || raw.trim() === "") return null;

  const text = raw.trim();
  if (text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      const result = trafficBeaconBodySchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  const params = new URLSearchParams(text);
  const candidate = {
    p: params.get("p") ?? undefined,
    r: params.get("r") ?? undefined,
    salon: params.get("salon") ?? undefined,
    salonType: params.get("salonType") ?? undefined,
    kind: params.get("kind") ?? undefined,
    tab: params.get("tab") ?? undefined,
  };
  const result = trafficBeaconBodySchema.safeParse(candidate);
  return result.success ? result.data : null;
}
