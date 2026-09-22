import { randomBytes, createHash } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import { enqueueEmail } from "@/shared/infra/queue/emailQueue";
import { getFrontendUrl } from "@/shared/constants/env";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class InviteTeamMemberUseCase {
  async execute(data: { email: string; role?: string; invitedById: string }) {
    const { email, role = "MASTER_ADMIN", invitedById } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, role: true, active: true },
    });

    if (existingUser && existingUser.role === "MASTER_ADMIN" && existingUser.active) {
      throw new AppError("Este e-mail já possui acesso interno", 409);
    }

    // Invalidate any pending invitations for this email
    await prisma.internalInvitation.updateMany({
      where: { email: email.toLowerCase(), status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    // Create token and hash
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const invitation = await prisma.internalInvitation.create({
      data: {
        email: email.toLowerCase(),
        invitedById,
        role: role as any,
        tokenHash,
        expiresAt,
      },
      select: { id: true, email: true, expiresAt: true, createdAt: true },
    });

    // Send invitation email
    const inviteUrl = `${getFrontendUrl()}/master/accept-invitation?token=${rawToken}`;
    const inviter = await prisma.user.findUnique({
      where: { id: invitedById },
      select: { name: true },
    });

    await enqueueEmail({
      kind: "welcome_staff",
      staffName: email.split("@")[0],
      barbershopName: "AgendAI",
      email: email.toLowerCase(),
      inviteUrl,
      deduplicationKey: `internal-invite:${invitation.id}`,
    }).catch(() => {});

    return { invitation, rawToken, inviterName: inviter?.name ?? "Administrador" };
  }
}
