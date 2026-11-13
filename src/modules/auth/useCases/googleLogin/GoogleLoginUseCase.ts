import { inject, injectable } from "tsyringe";
import { FastifyReply } from "fastify";
import { OAuth2Client } from "google-auth-library";
import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { AppError } from "@/shared/errors/AppError";
import { checkBarbershopAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { issueAuthSession } from "../../services/issueAuthSession";
import type { SessionContext } from "../../services/userSessionService";
import { prisma } from "@/libs/prismaClient";

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";

interface UserLike {
  id: string;
  name: string;
  email: string;
  role: string;
  barbershopId: string | null;
  cpf: string | null;
  emailVerified?: boolean;
  permissions?: string[] | null;
}

@injectable()
export class GoogleLoginUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository
  ) {}

  async execute(idToken: string, reply?: FastifyReply, context?: SessionContext) {
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

    // Identidade primeiro: com googleSub já gravado, só o MESMO sub do Google
    // abre a conta. Um token válido de OUTRA conta Google com o mesmo e-mail
    // verificado é recusado com um 401 genérico (mensagem idêntica à de
    // credenciais erradas — sem revelar o motivo). O código viaja em `code`
    // como sinal interno: o controller troca por um log próprio e o remove
    // antes de devolver a resposta ao cliente.
    if (user.googleSub && user.googleSub !== payload.sub) {
      throw new AppError("Credenciais inválidas", 401, undefined, "GOOGLE_SUB_MISMATCH");
    }

    if (user.barbershopId) {
      await checkBarbershopAccess(user.barbershopId, user.cpf ?? undefined);
    }

    const needsUpdate: Record<string, unknown> = {};

    // Vinculação só acontece no primeiro login — e o payload acima já exige
    // email_verified === true (linha 45), então um e-mail não verificado pelo
    // Google nunca grava googleSub.
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

    const userLike: UserLike = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      barbershopId: user.barbershopId ?? null,
      cpf: user.cpf ?? null,
      emailVerified: user.emailVerified ?? false,
      permissions: user.permissions ?? [],
    };

    return issueAuthSession(userLike, reply, true, context);
  }
}
