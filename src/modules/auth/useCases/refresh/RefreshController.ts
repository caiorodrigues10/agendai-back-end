import { FastifyRequest, FastifyReply } from "fastify";
import { validateSchema } from "@/shared/utils/zodValidation";
import { refreshSchema } from "../../schemas/authSchemas";
import { logAccess } from "@/shared/services/accessLogService";
import { verify, sign, Secret, SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import { container } from "tsyringe";
import type { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { mapRole, parseDuration } from "@/shared/utils/authUtils";

export const validateRefresh = validateSchema(refreshSchema);

export class RefreshController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const refreshToken = request.cookies.refresh_token;
    if (!refreshToken) {
      return reply.status(401).send({ message: "Refresh token não fornecido" });
    }
    try {
      const decoded = verify(refreshToken, auth.refreshSecret as Secret) as { sub: string; persistent?: boolean };
      const rememberMe = decoded.persistent === true;
      const tokenRecord = await prisma.refreshToken.findFirst({ where: { token: refreshToken } });
      if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
        return reply.status(401).send({ message: "Refresh token inválido" });
      }
      const userRepo = container.resolve<IUserRepository>("UserRepository");
      const user = await userRepo.findById(decoded.sub);
      if (!user) return reply.status(401).send({ message: "Usuário inválido" });
      const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
      const accessToken = sign({ role: user.role, barbershopId: user.barbershopId ?? undefined, cpf: (user as any).cpf ?? undefined }, auth.secret as Secret, accessOpts);
      const refreshOpts: SignOptions = { expiresIn: auth.refreshExpiresIn as any };
      const newRefreshToken = sign(
        { sub: user.id, jti: randomUUID(), persistent: rememberMe },
        auth.refreshSecret as Secret,
        refreshOpts
      );
      // Rotaciona: apaga o token antigo e cria um novo (evita acúmulo no banco)
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
      await prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: decoded.sub,
          expiresAt: new Date(Date.now() + parseDuration(auth.refreshExpiresIn))
        }
      });
      logAccess({
        userId: user.id,
        email: user.email,
        action: "REFRESH",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: true,
      });

      reply.setCookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.AUTH_COOKIE_SAME_SITE === 'none' ? 'none' : 'lax',
        path: '/api/auth',
        ...(rememberMe ? { maxAge: parseDuration(auth.refreshExpiresIn) / 1000 } : {}),
      });

      return reply.status(200).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: mapRole(user.role),
          barbershopId: user.barbershopId ?? undefined
        },
        accessToken,
      });
    } catch {
      return reply.status(401).send({ message: "Refresh token inválido" });
    }
  }
}
