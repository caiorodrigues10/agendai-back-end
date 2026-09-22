import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

export class RevokeInvitationUseCase {
  async execute(data: { invitationId: string; performedById: string }) {
    const { invitationId } = data;

    const invitation = await prisma.internalInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, status: true },
    });

    if (!invitation) {
      throw new AppError("Convite não encontrado", 404);
    }

    if (invitation.status !== "PENDING") {
      throw new AppError("Apenas convites pendentes podem ser revogados", 409);
    }

    await prisma.internalInvitation.update({
      where: { id: invitationId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    return { success: true };
  }
}
