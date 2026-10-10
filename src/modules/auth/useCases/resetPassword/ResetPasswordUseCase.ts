import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { enqueueEmail } from "@/shared/infra/queue/emailQueue";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("auth:reset-password");

@injectable()
export class ResetPasswordUseCase {
  constructor(
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) {}

  async execute(token: string, newPassword: string) {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      throw new AppError("Token inválido ou expirado", 400);
    }
    if (resetToken.usedAt) {
      throw new AppError("Token já utilizado", 400);
    }
    if (resetToken.expiresAt < new Date()) {
      throw new AppError("Token expirado. Solicite uma nova redefinição.", 400);
    }

    const passwordHash = await this.hashProvider.hash(newPassword);

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { email: resetToken.email },
        data: { password: passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // E-mail de confirmação de senha alterada — fire-and-forget.
    await enqueueEmail({
      kind: "password_changed",
      ownerName: updatedUser.name,
      email: updatedUser.email,
      deduplicationKey: `password_changed:${resetToken.id}`,
    }).catch((err) => {
      logger.error({ err, userId: updatedUser.id }, "Falha ao enfileirar e-mail de senha alterada");
    });

    return { message: "Senha redefinida com sucesso" };
  }
}
