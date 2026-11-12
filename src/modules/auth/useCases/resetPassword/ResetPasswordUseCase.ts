import { inject, injectable } from "tsyringe";
import { createHash } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { rlsTransaction } from "@/libs/prismaExtensions";
import { AppError } from "@/shared/errors/AppError";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { enqueueEmail } from "@/shared/infra/queue/emailQueue";
import { getModuleLogger } from "@/shared/utils/logger";
import { revokeAllSessionsForUser } from "../../services/userSessionService";
import { resetByEmail } from "@/shared/services/bruteForceProtection";
import { logAccess } from "@/shared/services/accessLogService";

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
      // Consumo atômico: só uma requisição consegue `usedAt: null -> now`.
      // Corrida entre dois resets válidos termina em 200 + 400 (não 2×200).
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new AppError("Token já utilizado", 400);
      }

      // Vincula ao usuário ATIVO e não removido — inativar/remover a conta
      // (ou trocar o e-mail) invalida qualquer token pendente.
      const user = await tx.user.findFirst({
        where: { email: resetToken.email, active: true, deletedAt: null },
        select: { id: true, name: true, email: true },
      });
      if (!user) {
        throw new AppError("Token inválido ou expirado", 400);
      }

      await tx.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      });
      return user;
    });

    // Trocar a senha é resposta a possível comprometimento: derruba sessões e
    // refresh tokens antigos e libera o lockout de login do e-mail.
    await revokeAllSessionsForUser(updatedUser.id, { reason: "password-reset" }).catch(
      (err) => {
        logger.error({ err, userId: updatedUser.id }, "Falha ao revogar sessões no reset de senha");
      }
    );
    await resetByEmail(updatedUser.email);

    await logAccess({
      userId: updatedUser.id,
      email: updatedUser.email,
      action: "PASSWORD_RESET",
      success: true,
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
