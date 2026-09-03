import { FastifyInstance } from "fastify";
import { realtimeHub } from "@/shared/services/realtimeService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function realtimeWsRoutes(app: FastifyInstance) {
  app.get(
    "/ws",
    { websocket: true },
    (socket, request) => {
      const barbershopId = String(
        (request.query as { barbershopId?: string }).barbershopId ?? ""
      ).trim();

      if (!UUID_RE.test(barbershopId)) {
        socket.close(1008, "barbershopId inválido");
        return;
      }

      realtimeHub.addConnection(barbershopId, socket);

      const heartbeat = setInterval(() => {
        if (socket.readyState !== 1) return;
        try {
          socket.ping();
        } catch {
          socket.terminate();
        }
      }, 25_000);

      socket.on("message", (raw) => {
        const text = raw.toString();
        if (text === "ping" || text === '"ping"') {
          socket.send("pong");
        }
      });

      const cleanup = () => {
        clearInterval(heartbeat);
        realtimeHub.removeConnection(barbershopId, socket);
      };
      socket.on("close", cleanup);
      socket.on("error", cleanup);
    }
  );
}
