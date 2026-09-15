import { FastifyRequest, FastifyReply } from "fastify";
import { verify, sign, Secret, SignOptions, JsonWebTokenError } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { switchAccountSchema } from "../../schemas/authSchemas";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import type { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { mapRole, parseDuration } from "@/shared/utils/authUtils";
import { getAuthCookieSecurityOptions } from "../../utils/authCookieOptions";
import { findUsableRefreshToken } from "../../services/refreshTokenUtils";
import { logAccess } from "@/shared/services/accessLogService";
import { getModuleLogger } from "@/shared/utils/logger";

const log = getModuleLogger("auth-switch-account");

export const validateSwitchAccount = validateSchema(switchAccountSchema);

type RefreshJwt = { sub: string; persistent?: boolean; purpose?: string };

/**
 * Troca de conta sem senha.
 *
 * Lê o cookie `saved_refresh_{userId}` (token de dispositivo lembrado),
 * valida contra o banco, e se válido:
 *  - Gera um novo token de sessão (purpose: 'session')
 *  - Set cookie 'refresh_token' com o novo token de sessão (torna a conta ativa)
 *  - NÃO rotaciona o token de dispositivo lembrado (mantém o cookie saved_ intacto)
 *
 * O token de dispositivo lembrado só expira naturalmente ou é revogado
 * explicitamente via /auth/forget-account.
 */
export class SwitchAccountController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.body as { userId: string };

    // 1. Ler cookie saved_refresh_{userId}
    const savedRefreshToken = request.cookies[`saved_refresh_${userId}`];
    if (!savedRefreshToken) {
      return reply.status(401).send({ message: "Conta salva não encontrada neste navegador" });
    }

    try {
      // 2. Verificar JWT
      const decoded = verify(savedRefreshToken, auth.refreshSecret as Secret) as RefreshJwt;
      if (decoded.sub !== userId) {
        return reply.status(401).send({ message: "Token não pertence a este usuário" });
      }

      // 3. Buscar token usável no banco (purpose: remembered_device)
      const { record: tokenRecord } = await findUsableRefreshToken(
        savedRefreshToken,
        userId,
        "remembered_device",
      );
      if (!tokenRecord) {
        return reply.status(401).send({ message: "Sessão salva expirada ou inválida" });
      }

      // 4. Buscar usuário
      const userRepo = container.resolve<IUserRepository>("UserRepository");
      const user = await userRepo.findById(userId);
      if (!user) {
        return reply.status(401).send({ message: "Usuário não encontrado" });
      }

      // 5. Gerar novo token de sessão (purpose: 'session')
      const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
      const accessToken = sign(
        { role: user.role, barbershopId: user.barbershopId ?? undefined },
        auth.secret as Secret,
        accessOpts,
      );

      const refreshExpiresMs = parseDuration(auth.refreshExpiresIn);
      const refreshOpts: SignOptions = { expiresIn: auth.refreshExpiresIn as any };
      const newSessionToken = sign(
        { sub: user.id, jti: randomUUID(), persistent: true, purpose: "session" },
        auth.refreshSecret as Secret,
        refreshOpts,
      );

      // 6. Criar nova sessão (sem apagar sessões de outros dispositivos)
      await prisma.refreshToken.create({
        data: {
          token: newSessionToken,
          userId,
          purpose: "session",
          expiresAt: new Date(Date.now() + refreshExpiresMs),
        },
      });

      // 7. Setar cookie 'refresh_token' (sessão ativa)
      reply.setCookie("refresh_token", newSessionToken, {
        ...getAuthCookieSecurityOptions(),
        maxAge: refreshExpiresMs / 1000,
      });

      logAccess({
        userId: user.id,
        email: user.email,
        action: "SWITCH_ACCOUNT",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        success: true,
      });

      log.info({ userId: user.id }, "account switched successfully");

      // 8. Retornar no mesmo formato do login/refresh
      return reply.status(200).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: mapRole(user.role),
          barbershopId: user.barbershopId ?? undefined,
        },
        accessToken,
      });
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        return reply.status(401).send({ message: "Sessão salva inválida" });
      }
      throw error;
    }
  }
}
