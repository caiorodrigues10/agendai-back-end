import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { RecordVisitUseCase } from "../application/useCases/RecordVisitUseCase";
import { trafficBeaconEnabled, trafficExtraIgnoreHosts } from "../trafficConfig";
import { DEFAULT_IGNORED_HOSTS } from "../domain/trafficExclusions";
import { trafficBeaconBodySchema } from "../schemas/trafficSchemas";

/**
 * Presentation for the anonymous beacon (`POST /api/ping`).
 *
 * Privacy contract:
 *   - the answer is ALWAYS 204, whatever happens (disabled, excluded, Redis
 *     down, malformed body) — a beacon must never surface an error page;
 *   - no request data (path, referrer, IP, UA) is ever logged: the only
 *     observability is the reason enum returned for metrics;
 *   - query strings / fragments / route ids are dropped during area
 *     classification and never reach a counter or the database.
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
    { counted: true; area: string } | { counted: false; reason: string }
  > {
    const body = parseBeaconBody(request.body);
    if (!body) return { counted: false, reason: "excluded" };

    const useCase = container.resolve(RecordVisitUseCase);
    return useCase.execute({
      path: body.p ?? "/",
      referrer: body.r,
      ip: request.ip,
      userAgent: headerValue(request.headers["user-agent"]),
      headers: request.headers as Record<string, unknown>,
      origin: headerValue(request.headers.origin),
      allowedOrigins: allowedOriginList(),
      ignoreHosts: [...DEFAULT_IGNORED_HOSTS, ...trafficExtraIgnoreHosts()],
      enabled: trafficBeaconEnabled(),
    });
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
 */
function parseBeaconBody(raw: unknown): { p?: string; r?: string } | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return trafficBeaconBodySchema.safeParse(raw).success
      ? (raw as { p?: string; r?: string })
      : null;
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
  const candidate = { p: params.get("p") ?? undefined, r: params.get("r") ?? undefined };
  const result = trafficBeaconBodySchema.safeParse(candidate);
  return result.success ? result.data : null;
}
