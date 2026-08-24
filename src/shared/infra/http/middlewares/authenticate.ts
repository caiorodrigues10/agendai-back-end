import { FastifyRequest, FastifyReply } from "fastify";
import { verify } from "jsonwebtoken";
import { AppError } from "@/shared/errors/AppError";
import auth from "@/config/auth";

interface JwtPayload {
  sub: string;
  role: string;
  barbershopId?: string;
  cpf?: string;
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
    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId,
      cpf: decoded.cpf
    };
  } catch {
    throw new AppError("Token inválido", 401);
  }
}
