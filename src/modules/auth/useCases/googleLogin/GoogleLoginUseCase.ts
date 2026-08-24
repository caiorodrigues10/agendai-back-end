import { inject, injectable } from "tsyringe";
import { OAuth2Client } from "google-auth-library";
import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { AppError } from "@/shared/errors/AppError";
import { checkBarbershopAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { issueAuthSession } from "../../services/issueAuthSession";
import { prisma } from "@/libs/prismaClient";

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";

@injectable()
export class GoogleLoginUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository
  ) {}

  async execute(idToken: string) {
    const client = new OAuth2Client(googleClientId);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError("Token Google inválido ou expirado", 401);
    }

    if (!payload || !payload.email || payload.email_verified !== true) {
      throw new AppError("E-mail não verificado pelo Google", 401);
    }

    const user = await this.userRepository.findByEmail(payload.email);

    if (!user || !user.active) {
      throw new AppError(
        "Conta não encontrada. Cadastre-se normalmente com e-mail e senha.",
        404,
        "GOOGLE_ACCOUNT_NOT_FOUND"
      );
    }

    if (user.barbershopId) {
      await checkBarbershopAccess(user.barbershopId, user.cpf ?? undefined);
    }

    const needsUpdate: Record<string, unknown> = {};

    if (!user.googleSub && payload.sub) {
      needsUpdate.googleSub = payload.sub;
    }

    if (!user.emailVerified) {
      needsUpdate.emailVerified = true;
    }

    if (Object.keys(needsUpdate).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: needsUpdate,
      });
    }

    return issueAuthSession(user);
  }
}
