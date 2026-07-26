import { FastifyRequest, FastifyReply } from "fastify";
import { verify } from "jsonwebtoken";
import auth from "@/config/auth";

interface JwtPayload {
  sub: string;
  role: string;
  barbershopId?: string;
  cpf?: string;
}

/**
 * Variante do `authenticate` para rotas com visão pública + visão staff.
 * Se houver token válido, popula `request.user`; caso contrário segue
 * anônimo (request.user permanece undefined) sem lançar erro.
 */
export async function authenticateOptional(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) return;

  const [, token] = authHeader.split(" ");
  if (!token) return;

  try {
    const decoded = verify(token, auth.secret) as JwtPayload;
    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId,
      cpf: decoded.cpf,
    };
  } catch {
    // Token inválido/expirado em rota pública: trata como anônimo
  }
}
