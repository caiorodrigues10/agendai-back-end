import { injectable } from "tsyringe";
import { randomBytes } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { enqueueEmail } from "@/shared/infra/queue";

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

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });
    if (!user || !user.active) {
      return { message: "Se o e-mail existir, você receberá um link de redefinição." };
    }

    await prisma.passwordResetToken.updateMany({
      where: { email: user.email, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    const resetRequest = await prisma.passwordResetToken.create({
      data: { email: user.email, token, expiresAt },
    });

    this.sendResetEmail(user.email, token, resetRequest.id).catch((err) => {
      logger.error({ err }, "Falha ao enfileirar e-mail de redefinição");
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

  private async sendResetEmail(email: string, token: string, requestId: string) {
    await enqueueEmail({
      kind: "forgot_password",
      email,
      token,
      deduplicationKey: `forgot-password:${requestId}`,
    });
  }
}
