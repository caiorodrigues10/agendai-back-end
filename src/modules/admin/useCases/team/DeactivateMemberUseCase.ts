import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

export class DeactivateMemberUseCase {
  async execute(data: { targetId: string; performedBy: string }) {
    const { targetId, performedBy } = data;

    if (targetId === performedBy) {
      throw new AppError("Não é possível desativar sua própria conta", 409);
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, active: true, name: true, email: true },
    });

    if (!target || target.role !== "MASTER_ADMIN") {
      throw new AppError("Usuário não encontrado ou não é administrador interno", 404);
    }

    if (!target.active) {
      throw new AppError("Usuário já está desativado", 409);
    }

    // Check last admin
    const activeAdminCount = await prisma.user.count({
      where: { role: "MASTER_ADMIN", active: true, deletedAt: null },
    });

    if (activeAdminCount <= 1) {
      throw new AppError("Não é possível desativar o último administrador ativo", 409);
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.user.update({
        where: { id: targetId },
        data: { active: false },
      });

      // Revoke all refresh tokens
      await tx.refreshToken.deleteMany({
        where: { userId: targetId },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: performedBy,
          action: "DEACTIVATE_INTERNAL_ADMIN",
          resource: "User",
          resourceId: targetId,
          details: JSON.stringify({
            name: target.name,
            email: target.email,
            reason: "Desativado pelo administrador",
          }),
        },
      });
    });

    return { success: true };
  }
}
