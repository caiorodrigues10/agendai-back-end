import { FastifyInstance } from "fastify";
import { TrafficBeaconController } from "../presentation/TrafficBeaconController";

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
    },
    controller.handle.bind(controller),
  );
}
