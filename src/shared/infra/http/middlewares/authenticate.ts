import { FastifyRequest, FastifyReply } from "fastify";
import { verify } from "jsonwebtoken";
import { AppError } from "@/shared/errors/AppError";
import auth from "@/config/auth";
import { checkSessionRevoked, touchSession } from "@/modules/auth/services/userSessionService";

interface JwtPayload {
  sub: string;
  role: string;
  barbershopId?: string;
  /** Id da `UserSession` (login/dispositivo) — claim `sid`. Tokens antigos sem `sid` são aceitos. */
  sid?: string;
  /** Presença = sessão de impersonation emitida pelo master (somente leitura). */
  imp?: boolean;
  /** id do master que iniciou o impersonation (auditoria). */
  impBy?: string;
}

/** Aceita somente `Bearer <JWT>` (scheme case-insensitive). */
export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, token, ...rest] = authorization.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    return null;
  }
  return token;
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    throw new AppError("Token ausente", 401);
  }

  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new AppError("Token mal formatado", 401);
  }

  try {
    const decoded = verify(token, auth.secret) as JwtPayload;

    if (decoded.imp === true) {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
      if (mutating) {
        throw new AppError("Sessão temporária é somente leitura", 403);
      }
    }

    if (decoded.sid) {
      const state = await checkSessionRevoked(decoded.sid);
      if (state === "revoked") {
        throw new AppError("Sessão encerrada", 401);
      }
      if (state === "unknown") {
        // Banco/Redis inacessíveis e sem estado da sessão:
        // falha FECHADA para MASTER_ADMIN (log já emitido pelo serviço),
        // falha ABERTA para os demais (o refresh continua bloqueado no banco).
        if (decoded.role === "MASTER_ADMIN") {
          throw new AppError("Não foi possível validar a sessão", 401);
        }
      } else {
        touchSession(decoded.sid);
      }
    }

    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId,
      sid: decoded.sid,
    };
    request.impersonated = decoded.imp === true;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Token inválido", 401);
  }
}
