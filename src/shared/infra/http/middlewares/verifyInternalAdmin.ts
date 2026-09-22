import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

/**
 * Middleware that verifies the current user is an active MASTER_ADMIN.
 * Must run AFTER `authenticate` middleware.
 * Checks:
 *  1. User exists and is not soft-deleted
 *  2. User is active
 *  3. User role is MASTER_ADMIN
 */
export async function verifyInternalAdmin(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const userId = request.user?.id;

  if (!userId) {
    throw new AppError("Não autenticado", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, active: true, deletedAt: true },
  });

  if (!user || user.deletedAt) {
    throw new AppError("Conta não encontrada ou removida", 401);
  }

  if (!user.active) {
    throw new AppError("Conta desativada. Acesso negado.", 403);
  }

  if (user.role !== "MASTER_ADMIN") {
    throw new AppError("Acesso restrito a administradores internos", 403);
  }
}

/**
 * Middleware that prevents the last active MASTER_ADMIN from being
 * deactivated or having their role changed.
 * Must run AFTER `verifyInternalAdmin`.
 * Call with the target userId as a route param.
 */
export async function protectLastAdmin(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const params = request.params as { id?: string };
  const targetId = params.id;

  if (!targetId) return;

  // Only check if the target is the requesting user (self-protection)
  if (targetId !== request.user?.id) return;

  const activeAdminCount = await prisma.user.count({
    where: {
      role: "MASTER_ADMIN",
      active: true,
      deletedAt: null,
    },
  });

  if (activeAdminCount <= 1) {
    throw new AppError(
      "Não é possível desativar o último administrador ativo",
      409
    );
  }
}
