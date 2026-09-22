import { createHash } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import { container } from "tsyringe";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AcceptInvitationUseCase {
  async execute(data: { token: string; name: string; password: string }) {
    const { token, name, password } = data;

    const tokenHash = hashToken(token);

    const invitation = await prisma.internalInvitation.findFirst({
      where: { tokenHash, status: "PENDING" },
      select: { id: true, email: true, expiresAt: true, role: true },
    });

    if (!invitation) {
      throw new AppError("Convite não encontrado ou já utilizado", 404);
    }

    if (new Date() > invitation.expiresAt) {
      await prisma.internalInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      throw new AppError("Convite expirado. Solicite um novo convite.", 410);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, role: true, active: true },
    });

    if (existingUser) {
      throw new AppError(
        "Este e-mail já possui uma conta. Faça login.",
        409
      );
    }

    // Create user
    const hashProvider = container.resolve<IHashProvider>("HashProvider");
    const hashedPassword = await hashProvider.hash(password);

    const user = await prisma.user.create({
      data: {
        name,
        email: invitation.email,
        password: hashedPassword,
        role: invitation.role,
        active: true,
        emailVerified: true,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    // Mark invitation as accepted
    await prisma.internalInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    return user;
  }
}
