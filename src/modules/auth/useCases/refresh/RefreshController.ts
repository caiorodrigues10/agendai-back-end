import { FastifyRequest, FastifyReply } from "fastify";
import { validateSchema } from "@/shared/utils/zodValidation";
import { refreshSchema } from "../../schemas/authSchemas";
import { logAccess } from "@/shared/services/accessLogService";
import { verify, sign, Secret, SignOptions, JsonWebTokenError } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import { container } from "tsyringe";
import type { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { mapRole, parseDuration } from "@/shared/utils/authUtils";
import { getAuthCookieSecurityOptions } from "../../utils/authCookieOptions";
import { getModuleLogger } from "@/shared/utils/logger";
import { findUsableRefreshToken } from "../../services/refreshTokenUtils";
import { resolveActiveSession } from "../../services/activeShopSession";

const log = getModuleLogger("auth-refresh");

export const validateRefresh = validateSchema(refreshSchema);

type RefreshJwt = {
  sub: string;
  persistent?: boolean;
  purpose?: string;
  activeBarbershopId?: string;
  /** Id da `UserSession` (tokens antigos podem não ter). */
  sid?: string;
};

export class RefreshController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const refreshToken = request.cookies.refresh_token;
    if (!refreshToken) {
      return reply.status(401).send({ message: "Refresh token não fornecido" });
    }
    try {
      const decoded = verify(refreshToken, auth.refreshSecret as Secret) as RefreshJwt;
      const rememberMe = decoded.persistent === true;

      // Busca somente tokens de sessão (nunca remembered_device)
      const { record: tokenRecord, concurrentReuse } = await findUsableRefreshToken(
        refreshToken,
        decoded.sub,
        "session",
      );
      if (!tokenRecord) {
        return reply.status(401).send({ message: "Refresh token inválido" });
      }

      // Sessão (claim `sid`): sessão revogada/expirada não rotaciona mais —
      // apaga o token usado e derruba o dispositivo. Tokens antigos sem `sid`
      // seguem apenas a validação do banco de refresh tokens.
      if (decoded.sid) {
        const sessionRow = await prisma.userSession.findUnique({
          where: { id: decoded.sid },
          select: { revokedAt: true, expiresAt: true },
        });
        if (!sessionRow || sessionRow.revokedAt || sessionRow.expiresAt.getTime() <= Date.now()) {
          await prisma.refreshToken.deleteMany({ where: { token: refreshToken, purpose: "session" } });
          reply.setCookie("refresh_token", "", { ...getAuthCookieSecurityOptions(), maxAge: 0 });
          log.info({ userId: decoded.sub, sid: decoded.sid }, "refresh de sessão encerrada recusado");
          return reply.status(401).send({ message: "Sessão encerrada" });
        }
      }

      const userRepo = container.resolve<IUserRepository>("UserRepository");
      const user = await userRepo.findById(decoded.sub);
      if (!user) return reply.status(401).send({ message: "Usuário inválido" });

      // Salão ativo vem do claim do refresh token e é revalidado aqui: se o
      // acesso acabou, a sessão cai para o salão original do usuário.
      const session = await resolveActiveSession(user, decoded.activeBarbershopId);
      const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
      const accessToken = sign(
        {
          role: session.role,
          barbershopId: session.barbershopId ?? undefined,
          ...(decoded.sid ? { sid: decoded.sid } : {}),
        },
        auth.secret as Secret,
        accessOpts,
      );

      let cookieToken = tokenRecord.token;
      if (!concurrentReuse) {
        const refreshOpts: SignOptions = { expiresIn: auth.refreshExpiresIn as any };
        const keepActiveShop = Boolean(
          session.barbershopId && session.barbershopId !== user.barbershopId,
        );
        const newRefreshToken = sign(
          {
            sub: user.id,
            jti: randomUUID(),
            persistent: rememberMe,
            purpose: "session",
            ...(decoded.sid ? { sid: decoded.sid } : {}),
            ...(keepActiveShop ? { activeBarbershopId: session.barbershopId } : {}),
          },
          auth.refreshSecret as Secret,
          refreshOpts
        );
        await prisma.refreshToken.deleteMany({ where: { token: refreshToken, purpose: "session" } });
        const rotated = await prisma.refreshToken.create({
          data: {
            token: newRefreshToken,
            userId: decoded.sub,
            purpose: "session",
            expiresAt: new Date(Date.now() + parseDuration(auth.refreshExpiresIn))
          }
        });
        cookieToken = newRefreshToken;

        // Sessão deslizante: acompanha a nova validade do refresh token.
        if (decoded.sid) {
          await prisma.userSession
            .updateMany({
              where: { id: decoded.sid, revokedAt: null },
              data: {
                refreshTokenId: rotated.id,
                lastSeenAt: new Date(),
                expiresAt: new Date(Date.now() + parseDuration(auth.refreshExpiresIn)),
              },
            })
            .catch((err: unknown) => log.error({ err, sid: decoded.sid }, "falha ao atualizar sessão no refresh"));
        }
      } else {
        log.info({ userId: decoded.sub }, "refresh reuse within grace window");
      }

      logAccess({
        userId: user.id,
        email: user.email,
        action: "REFRESH",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: true,
      });

      reply.setCookie('refresh_token', cookieToken, {
        ...getAuthCookieSecurityOptions(),
        ...(rememberMe ? { maxAge: parseDuration(auth.refreshExpiresIn) / 1000 } : {}),
      });

      return reply.status(200).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: mapRole(session.role),
          barbershopId: session.barbershopId ?? undefined,
          emailVerified: user.emailVerified ?? false,
        },
        accessToken,
      });
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        return reply.status(401).send({ message: "Refresh token inválido" });
      }
      throw error;
    }
  }
}
