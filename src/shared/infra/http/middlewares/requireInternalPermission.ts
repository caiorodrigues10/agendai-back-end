import { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import {
  hasInternalPermission,
  type InternalPermission,
} from "@/modules/admin/internalPermissions";

export function requireInternalPermission(permission: InternalPermission) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!hasInternalPermission(request.user?.permissions, permission)) {
      throw new AppError("Você não tem permissão para acessar esta área interna", 403);
    }
  };
}
