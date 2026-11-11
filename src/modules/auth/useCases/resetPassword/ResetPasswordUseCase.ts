import { inject, injectable } from "tsyringe";
import { createHash } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { rlsTransaction } from "@/libs/prismaExtensions";
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
    // O banco guarda o SHA-256; o token chega em plaintext pelo link do e-mail.
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
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

    const updatedUser = await rlsTransaction(async (tx) => {
      const user = await tx.user.update({
        where: { email: resetToken.email },
        data: { password: passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
      return user;
    });

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
