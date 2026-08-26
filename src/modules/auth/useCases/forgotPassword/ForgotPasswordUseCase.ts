import { injectable } from "tsyringe";
import { randomBytes } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { container } from "tsyringe";
import type { IEmailProvider } from "@/shared/container/providers/EmailProvider/IEmailProvider";

const logger = getModuleLogger("forgot-password");
const TOKEN_EXPIRY_HOURS = 1;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 3600;

@injectable()
export class ForgotPasswordUseCase {
  async execute(email: string, ip: string) {
    const rateKey = `forgotpwd:rate:${email}`;
    const count = await this.getRateLimit(rateKey);
    if (count > RATE_LIMIT_MAX) {
      throw new AppError("Muitas solicitações. Tente novamente em 1 hora.", 429);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return { message: "Se o e-mail existir, você receberá um link de redefinição." };
    }

    await prisma.passwordResetToken.updateMany({
      where: { email, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { email, token, expiresAt },
    });

    this.sendResetEmail(email, token).catch((err) => {
      logger.error({ err, email }, "Falha ao enviar e-mail de redefinição");
    });

    return { message: "Se o e-mail existir, você receberá um link de redefinição." };
  }

  private async getRateLimit(key: string): Promise<number> {
    try {
      const { getRedisConnection } = await import("@/shared/infra/queue/redisConnection");
      const redis = getRedisConnection();
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW);
      }
      return count;
    } catch {
      return 0;
    }
  }

  private async sendResetEmail(email: string, token: string) {
    const emailProvider = container.resolve<IEmailProvider>("EmailProvider");

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3003"}/reset-password?token=${token}`;

    await emailProvider.send({
      to: email,
      subject: "Redefinir sua senha - AgendAI",
      template: "forgot_password",
      html: `
        <h2>Redefinição de Senha</h2>
        <p>Você solicitou a redefinição da sua senha.</p>
        <p>Clique no link abaixo para criar uma nova senha:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>Este link expira em ${TOKEN_EXPIRY_HOURS} hora.</p>
        <p>Se você não solicitou esta redefinição, ignore este e-mail.</p>
      `,
      text: `Redefinição de Senha\n\nVocê solicitou a redefinição da sua senha.\n\nAcesse: ${resetUrl}\n\nEste link expira em ${TOKEN_EXPIRY_HOURS} hora.\nSe você não solicitou esta redefinição, ignore este e-mail.`,
    });
  }
}
