import { FastifyInstance, FastifySchema } from "fastify";
import { TrafficBeaconController } from "../presentation/TrafficBeaconController";

const TRAFFIC_BEACON_SCHEMA = {
  // `consumes` and the response `content` are consumed by @fastify/swagger;
  // the explicit string body keeps text/plain a CORS-simple request.
  consumes: ["text/plain"],
  body: { type: "string", maxLength: 8192 },
  response: {
    204: {
      description: "Beacon recebido; nenhum conteúdo é retornado.",
      type: "string",
      content: {
        "text/plain": { schema: { type: "string" } },
      },
    },
  },
} as unknown as FastifySchema;

/**
 * Anonymous page-view beacon — `POST /api/ping`.
 *
 * The path is intentionally neutral (no analytics/track/collect/hit token)
 * so the endpoint does not advertise what it does to casual scanners.
 *
 * Fastify ships a built-in `text/plain` parser (raw string body), so the
 * browser can fire the beacon as a "simple request" — no CORS preflight —
 * and always receives `204 No Content`. The route-level error handler
 * guarantees that even an unparseable body answers 204, never a 4xx page.
 */
export async function trafficBeaconRoutes(app: FastifyInstance): Promise<void> {
  const controller = new TrafficBeaconController();

  app.post(
    "/ping",
    {
      // Never let a body/parse failure escape as an error page.
      errorHandler: (_error, _request, reply) => reply.status(204).send(),
      schema: TRAFFIC_BEACON_SCHEMA,
    },
    controller.handle.bind(controller),
  );
}
