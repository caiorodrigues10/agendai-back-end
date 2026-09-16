import { injectable } from "tsyringe";
import { randomBytes } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { enqueueEmail } from "@/shared/infra/queue";

const logger = getModuleLogger("resend-verification");
const TOKEN_EXPIRY_HOURS = 24;

@injectable()
export class ResendVerificationEmailUseCase {
  async execute(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    if (user.emailVerified) {
      throw new AppError("E-mail já verificado", 400);
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    await prisma.verificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    await enqueueEmail({
      kind: "verify_email",
      ownerName: user.name,
      email: user.email,
      token,
      deduplicationKey: `verify-email:${user.id}:${Date.now()}`,
    }).catch((err) => {
      logger.error({ err }, "Falha ao enfileirar e-mail de verificação");
    });

    return { message: "E-mail de verificação reenviado." };
  }
}
