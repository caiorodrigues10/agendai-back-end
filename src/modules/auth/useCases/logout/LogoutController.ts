import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { LogoutUseCase } from "./LogoutUseCase";
import { logAccess } from "@/shared/services/accessLogService";
import { UserRepository } from "@/modules/users/infra/repositories/UserRepository";

export class LogoutController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ message: "Não autenticado" });
    }

    const useCase = container.resolve(LogoutUseCase);
    await useCase.execute(user.id);

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
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 0,
    });

    return reply.status(200).send({ message: "Logout realizado com sucesso" });
  }

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
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 0,
    });

    return reply.status(200).send({
      message: "Todas as sessões revogadas com sucesso",
      revokedTokens: count,
    });
  }
}