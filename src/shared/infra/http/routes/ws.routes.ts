import { FastifyInstance } from "fastify";
import { verify } from "jsonwebtoken";
import { realtimeHub } from "@/shared/services/realtimeService";
import auth from "@/config/auth";
import { resolveOrgAccessToBarbershop } from "@/shared/utils/organizationAccess";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface WsJwt {
  sub: string;
  role: string;
  barbershopId?: string;
}

export async function realtimeWsRoutes(app: FastifyInstance) {
  app.get(
    "/ws",
    { websocket: true },
    async (socket, request) => {
      const barbershopId = String(
        (request.query as { barbershopId?: string }).barbershopId ?? ""
      ).trim();
      const token = String(
        (request.query as { token?: string }).token ?? ""
      ).trim();

      if (!UUID_RE.test(barbershopId)) {
        socket.close(1008, "barbershopId inválido");
        return;
      }

      if (!token) {
        socket.close(1008, "Não autenticado");
        return;
      }

      let decoded: WsJwt;
      try {
        decoded = verify(token, auth.secret) as WsJwt;
      } catch {
        socket.close(1008, "Token inválido");
        return;
      }

      // Cross-salão org-aware: salão da sessão (ou MASTER_ADMIN) conecta direto;
      // salão de outra org → resolveOrgAccessToBarbershop = NONE → 1008.
      // Sem store de requestContext aqui (WS não passa por setRlsContext), o RLS de
      // `users` vê current='' e libera a row do requisitante — é o cenário ideal
      // para a checagem. Falha (try/catch) fecha com 1008 (fail-closed).
      if (decoded.role !== "MASTER_ADMIN" && decoded.barbershopId !== barbershopId) {
        try {
          const access = await resolveOrgAccessToBarbershop(
            decoded.sub,
            decoded.role,
            barbershopId
          );
          if (access === "NONE") {
            socket.close(1008, "Acesso negado");
            return;
          }
        } catch {
          socket.close(1008, "Acesso negado");
          return;
        }
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
