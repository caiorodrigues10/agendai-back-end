import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { verify, Secret } from "jsonwebtoken";
import { LogoutUseCase } from "./LogoutUseCase";
import { logAccess } from "@/shared/services/accessLogService";
import { UserRepository } from "@/modules/users/infra/repositories/UserRepository";
import { getAuthCookieSecurityOptions } from "../../utils/authCookieOptions";
import { findUsableRefreshToken } from "../../services/refreshTokenUtils";
import auth from "@/config/auth";

export class LogoutController {
  /** Sair da sessão atual — revoga SOMENTE o token de sessão. */
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ message: "Não autenticado" });
    }

    const useCase = container.resolve(LogoutUseCase);
    await useCase.execute(user.id, request.cookies.refresh_token);

    const userRepo = new UserRepository();
    const fullUser = await userRepo.findById(user.id);

    logAccess({
      userId: user.id,
      email: fullUser?.email,
      action: "LOGOUT",
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      success: true,
    });

    reply.setCookie('refresh_token', '', {
      ...getAuthCookieSecurityOptions(),
      maxAge: 0,
    });

    return reply.status(200).send({ message: "Logout realizado com sucesso" });
  }

  /** Revogar TODAS as sessões + dispositivos lembrados. */
  async revokeAllSessions(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ message: "Não autenticado" });
    }

    const useCase = container.resolve(LogoutUseCase);
    const count = await useCase.revokeAllSessions(user.id);

    const userRepo = new UserRepository();
    const fullUser = await userRepo.findById(user.id);

    logAccess({
      userId: user.id,
      email: fullUser?.email,
      action: "REVOKE_ALL_SESSIONS",
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      success: true,
    });

    reply.setCookie('refresh_token', '', {
      ...getAuthCookieSecurityOptions(),
      maxAge: 0,
    });

    reply.setCookie(`saved_refresh_${user.id}`, '', {
      ...getAuthCookieSecurityOptions(),
      maxAge: 0,
    });

    return reply.status(200).send({
      message: "Todas as sessões revogadas com sucesso",
      revokedTokens: count,
    });
  }

  /** Remover uma conta salva — revoga SOMENTE o token de dispositivo lembrado. */
  async forgetAccount(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.body as { userId: string };

    // Segurança: só permitir remover a própria conta salva.
    // O cookie saved_refresh_{userId} deve existir e ser um JWT válido.
    const savedCookie = request.cookies[`saved_refresh_${userId}`];
    if (!savedCookie) {
      return reply.status(403).send({ message: "Acesso negado" });
    }

    try {
      const decoded = verify(savedCookie, auth.refreshSecret as Secret) as { sub?: string };
      if (decoded.sub !== userId) {
        return reply.status(403).send({ message: "Acesso negado" });
      }
    } catch {
      return reply.status(403).send({ message: "Acesso negado" });
    }

    const { record } = await findUsableRefreshToken(
      savedCookie,
      userId,
      "remembered_device",
    );
    if (!record) {
      return reply.status(403).send({ message: "Acesso negado" });
    }

    const useCase = container.resolve(LogoutUseCase);
    await useCase.revokeRememberedDevice(userId);

    reply.setCookie(`saved_refresh_${userId}`, '', {
      ...getAuthCookieSecurityOptions(),
      maxAge: 0,
    });

    return reply.status(200).send({ message: "Conta removida das salvas" });
  }
}
