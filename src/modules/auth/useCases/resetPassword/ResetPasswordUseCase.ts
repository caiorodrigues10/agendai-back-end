import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";

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

    await prisma.$transaction([
      prisma.user.update({
        where: { email: resetToken.email },
        data: { password: passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: "Senha redefinida com sucesso" };
  }
}
