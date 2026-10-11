import { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import type { EmployeePermission } from "@/modules/users/dtos/IUserResponseDTO";

/**
 * Exige ao menos uma das permissões de funcionário informadas.
 *
 * - OWNER e MASTER_ADMIN passam sempre (acesso total ao próprio salão).
 * - O JWT de acesso não carrega permissões; quando o claim falta, as
 *   permissões são lidas do banco — revogar uma permissão passa a valer na
 *   requisição seguinte, sem depender de /refresh nem de novo login.
 *
 * Fonte única: antes existia uma cópia local desta lógica em fiado.routes.ts
 * e expenses.routes.ts (com resposta `{ error }` fora do padrão AppError).
 */
export function requirePermission(...perms: EmployeePermission[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user) throw new AppError("Não autenticado", 401);
    if (user.role === "MASTER_ADMIN" || user.role === "OWNER") return;
    const permissions =
      user.permissions ??
      (((await prisma.user.findUnique({
        where: { id: user.id },
        select: { permissions: true },
      }))?.permissions as string[] | null) ?? []);
    if (!perms.some((perm) => permissions.includes(perm))) {
      throw new AppError("Você não tem permissão para esta ação", 403);
    }
  };
}
