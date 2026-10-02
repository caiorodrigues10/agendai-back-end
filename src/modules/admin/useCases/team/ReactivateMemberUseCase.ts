import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

export class ReactivateMemberUseCase {
  async execute(data: { targetId: string; performedBy: string }) {
    const { targetId, performedBy } = data;

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, active: true, deletedAt: true, name: true, email: true },
    });

    if (!target || target.role !== "MASTER_ADMIN" || target.deletedAt) {
      throw new AppError("Usuário não encontrado ou não é administrador interno", 404);
    }

    if (target.active) {
      return { success: true, alreadyActive: true };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetId },
        data: { active: true },
      });

      await tx.auditLog.create({
        data: {
          userId: performedBy,
          action: "REACTIVATE_INTERNAL_ADMIN",
          resource: "User",
          resourceId: targetId,
          details: JSON.stringify({
            name: target.name,
            email: target.email,
            reason: "Reativado pelo administrador",
          }),
        },
      });
    });

    return { success: true, alreadyActive: false };
  }
}
