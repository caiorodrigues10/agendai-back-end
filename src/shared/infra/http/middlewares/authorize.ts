import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";

export function authorize(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      throw new AppError("Acesso negado", 403);
    }
  };
}
