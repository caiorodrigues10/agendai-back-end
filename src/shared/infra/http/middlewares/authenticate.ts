import { FastifyRequest, FastifyReply } from "fastify";
import { verify } from "jsonwebtoken";
import { AppError } from "@/shared/errors/AppError";
import auth from "@/config/auth";

interface JwtPayload {
  sub: string;
  role: string;
  barbershopId?: string;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    throw new AppError("Token ausente", 401);
  }

  const [, token] = authHeader.split(" ");

  if (!token) {
    throw new AppError("Token mal formatado", 401);
  }

  try {
    const decoded = verify(token, auth.secret) as JwtPayload;
    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId
    };
  } catch {
    throw new AppError("Token inválido", 401);
  }
}
