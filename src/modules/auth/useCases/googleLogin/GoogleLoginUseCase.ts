import { inject, injectable } from "tsyringe";
import { FastifyReply } from "fastify";
import { OAuth2Client } from "google-auth-library";
import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { AppError } from "@/shared/errors/AppError";
import { checkBarbershopAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { checkLock, recordFailure, resetAttempts } from "@/shared/services/bruteForceProtection";
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

    const email = payload.email;
    const ip = context?.ip ?? "";

    // Lockout por conta — mesmo mecanismo do LoginController
    // (checkLock/recordFailure/resetAttempts em bruteForceProtection). Aqui,
    // depois da verificação do token, é o único ponto em que a conta (e-mail)
    // é conhecida: o corpo da requisição só tem o idToken.
    const lock = await checkLock(email, ip);
    if (lock.locked) {
      throw new AppError(
        `Conta bloqueada por múltiplas tentativas. Tente novamente em ${lock.retryAfterSeconds} segundos.`,
        423,
      );
    }

    try {
      const user = await this.userRepository.findByEmail(email);

      // Soft delete corta aqui (mesmo que `active` ainda esteja true): usuário
      // removido responde como conta inexistente — sem revelar que existiu.
      // findByEmail já filtra `deletedAt` no repositório; a checagem aqui é a
      // barreira explícita do login.
      if (!user || !user.active || user.deletedAt) {
        // 4o argumento = `code` (AppError(message, statusCode, errors?, code?)).
        // No 3o (errors) o handler app.ts devolvia `errors` e o branch do front
        // `err.code === 'GOOGLE_ACCOUNT_NOT_FOUND'` nunca disparava.
        throw new AppError(
          "Conta não encontrada. Cadastre-se normalmente com e-mail e senha.",
          404,
          undefined,
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

      const session = await issueAuthSession(userLike, reply, true, context);
      await resetAttempts(email, ip);
      return session;
    } catch (err) {
      // Contam como tentativa os mesmos casos do login por senha: 401 (sub
      // divergente) e 404 (conta inexistente/apagada — o análogo do 401 de
      // "credenciais inválidas" para e-mail que não existe). Assinatura/
      // assinatura de negócio (402/403) e falhas internas não contam.
      if (err instanceof AppError && (err.statusCode === 401 || err.statusCode === 404)) {
        const failure = await recordFailure(email, ip);
        if (failure.locked) {
          throw new AppError(
            `Conta bloqueada por múltiplas tentativas. Tente novamente em ${failure.retryAfterSeconds} segundos.`,
            423,
          );
        }
      }
      throw err;
    }
  }
}
