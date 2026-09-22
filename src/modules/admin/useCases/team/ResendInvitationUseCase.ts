import { randomBytes, createHash } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import { enqueueEmail } from "@/shared/infra/queue/emailQueue";
import { getFrontendUrl } from "@/shared/constants/env";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class ResendInvitationUseCase {
  async execute(data: { invitationId: string; performedById: string }) {
    const { invitationId, performedById } = data;

    const invitation = await prisma.internalInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, email: true, status: true, invitedById: true },
    });

    if (!invitation) {
      throw new AppError("Convite não encontrado", 404);
    }

    if (invitation.status !== "PENDING") {
      throw new AppError("Apenas convites pendentes podem ser reenviados", 409);
    }

    // Revoke old and create new
    await prisma.internalInvitation.update({
      where: { id: invitationId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const newInvitation = await prisma.internalInvitation.create({
      data: {
        email: invitation.email,
        invitedById: invitation.invitedById,
        role: "MASTER_ADMIN",
        tokenHash,
        expiresAt,
      },
      select: { id: true, email: true, expiresAt: true },
    });

    const inviteUrl = `${getFrontendUrl()}/master/accept-invitation?token=${rawToken}`;

    await enqueueEmail({
      kind: "welcome_staff",
      staffName: invitation.email.split("@")[0],
      barbershopName: "AgendAI",
      email: invitation.email,
      inviteUrl,
      deduplicationKey: `internal-invite-resend:${newInvitation.id}`,
    }).catch(() => {});

    return { invitation: newInvitation };
  }
}
