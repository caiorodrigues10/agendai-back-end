import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { sign, verify, Secret, SignOptions, JsonWebTokenError } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import { mapRole, parseDuration } from "@/shared/utils/authUtils";
import { resolveOrgAccessToBarbershop } from "@/shared/utils/organizationAccess";
import { findUsableRefreshToken } from "@/modules/auth/services/refreshTokenUtils";
import { getAuthCookieSecurityOptions } from "@/modules/auth/utils/authCookieOptions";
import { validateSchema } from "@/shared/utils/zodValidation";
import { logAccess } from "@/shared/services/accessLogService";
import { getModuleLogger } from "@/shared/utils/logger";
import { switchShopSchema } from "../../organizationSchema";

const log = getModuleLogger("org-switch-shop");

export const validateSwitchShop = validateSchema(switchShopSchema);

const paramsSchema = z.object({ id: z.string().uuid("ID de organização inválido") });

type SessionRefreshJwt = { sub: string; persistent?: boolean; purpose?: string; sid?: string };

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  barbershopId: string | null;
  emailVerified: boolean;
  active: boolean;
  deletedAt: Date | null;
};

/**
 * Troca o salão ativo da sessão (`POST /organizations/:orgId/switch-shop`).
 *
 * Emite um novo access token com o `barbershopId` do salão alvo (mantendo `sub`)
 * e grava o alvo no claim `activeBarbershopId` do refresh token, para que o
 * /auth/refresh continue devolvendo o mesmo salão. `users.barbershopId` não é
 * alterado — o salão de origem continua sendo o vínculo real do usuário.
 *
 * Guard: só `authenticate` (+ rate limit de auth). O guard padrão de
 * organizations (authorize/checkSubscription/checkDashboardAccess/setRlsContext)
 * foi omitido de propósito:
 * - a autorização é resolvida por `resolveOrgAccessToBarbershop === 'FULL'`,
 *   que já cobre dono do salão, MASTER_ADMIN e OWNER/ADMIN da organização;
 * - checkSubscription/checkDashboardAccess olham o salão ATUAL e travariam a
 *   troca quando o salão de origem está sem plano;
 * - sem `setRlsContext` o contexto RLS fica vazio ('') e as policies liberam
 *   tudo, o que deixa esta request ler apenas metadados de acesso (user,
 *   barbershop.organizationId, organization_members) — nenhum dado operacional
 *   ou financeiro de salão.
 */
export class SwitchShopController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const requester = request.user!;
    const { id: orgId } = paramsSchema.parse(request.params);
    const { barbershopId } = switchShopSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { id: requester.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barbershopId: true,
        emailVerified: true,
        active: true,
        deletedAt: true,
      },
    });
    if (!user || !user.active || user.deletedAt) {
      throw new AppError("Usuário não encontrado", 401);
    }

    // Salão de origem (linha do usuário): voltar para ele restaura a própria
    // sessão de login, então dispensa o vínculo com a organização — é o que
    // permite "Voltar ao salão original" quando o salão de origem não é membro
    // de nenhuma organização. Nenhum acesso novo é concedido aqui: o token de
    // login já trazia esse salão.
    const isHomeShop = Boolean(user.barbershopId) && barbershopId === user.barbershopId;

    if (!isHomeShop) {
      const shop = await prisma.barbershop.findUnique({
        where: { id: barbershopId },
        select: { organizationId: true },
      });
      if (!shop || shop.organizationId !== orgId) {
        throw new AppError("Salão não pertence a esta organização", 403);
      }

      const access = await resolveOrgAccessToBarbershop(user.id, user.role, barbershopId);
      if (access !== "FULL") {
        throw new AppError("Você não tem acesso a este salão", 403);
      }
    }

    // EMPLOYEE operando salão da organização recebe papel efetivo OWNER no token
    // (ver comentário em activeShopSession.ts); o papel do banco não muda.
    const sessionRole = !isHomeShop && user.role === "EMPLOYEE" ? "OWNER" : user.role;

    const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
    const accessToken = sign(
      // `sid` preserva a sessão rastreável (trocar de salão NÃO é novo login).
      { role: sessionRole, barbershopId, ...(requester.sid ? { sid: requester.sid } : {}) },
      auth.secret as Secret,
      accessOpts,
    );

    await this.rotateSessionRefreshToken(request, reply, user.id, barbershopId);

    await logAccess({
      userId: user.id,
      email: user.email,
      action: "SWITCH_SHOP",
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      success: true,
    });

    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: "SWITCH_SHOP",
          resource: "Barbershop",
          resourceId: barbershopId,
          details: JSON.stringify({
            from: requester.barbershopId ?? null,
            to: barbershopId,
            organizationId: orgId,
          }),
          ipAddress: request.ip,
        },
      })
      .catch(() => undefined);

    log.info(
      { userId: user.id, from: requester.barbershopId ?? null, to: barbershopId },
      "shop switched",
    );

    return reply.status(200).send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: mapRole(sessionRole),
        barbershopId,
        emailVerified: user.emailVerified ?? false,
      },
      accessToken,
    });
  }

  /**
   * Grava o salão alvo no refresh token da sessão (claim `activeBarbershopId`)
   * e o re-emite para o cookie — sem isso o próximo /auth/refresh voltaria ao
   * salão original. Cookie ilegível/expirado apenas é ignorado: a troca segue
   * válida até a expiração do access token.
   */
  private async rotateSessionRefreshToken(
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
    activeBarbershopId: string,
  ): Promise<void> {
    const currentToken = request.cookies.refresh_token;
    if (!currentToken) return;

    let decoded: SessionRefreshJwt;
    try {
      decoded = verify(currentToken, auth.refreshSecret as Secret) as SessionRefreshJwt;
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        log.warn({ userId }, "switch-shop: refresh cookie inválido, claim não persistido");
        return;
      }
      throw error;
    }

    if (decoded.sub !== userId || (decoded.purpose && decoded.purpose !== "session")) return;

    const { record } = await findUsableRefreshToken(currentToken, userId, "session");
    if (!record) return;

    const refreshExpiresMs = parseDuration(auth.refreshExpiresIn);
    const refreshOpts: SignOptions = { expiresIn: auth.refreshExpiresIn as any };
    const nextToken = sign(
      {
        sub: userId,
        jti: randomUUID(),
        persistent: decoded.persistent === true,
        purpose: "session",
        ...(decoded.sid ? { sid: decoded.sid } : {}),
        activeBarbershopId,
      },
      auth.refreshSecret as Secret,
      refreshOpts,
    );

    await prisma.refreshToken.deleteMany({ where: { token: currentToken, purpose: "session" } });
    const rotated = await prisma.refreshToken.create({
      data: {
        token: nextToken,
        userId,
        purpose: "session",
        expiresAt: new Date(Date.now() + refreshExpiresMs),
      },
    });

    if (decoded.sid) {
      await prisma.userSession
        .updateMany({
          where: { id: decoded.sid, revokedAt: null },
          data: { refreshTokenId: rotated.id, lastSeenAt: new Date() },
        })
        .catch((err: unknown) => log.error({ err, sid: decoded.sid }, "switch-shop: falha ao atualizar sessão"));
    }

    reply.setCookie("refresh_token", nextToken, {
      ...getAuthCookieSecurityOptions(),
      ...(decoded.persistent === true ? { maxAge: refreshExpiresMs / 1000 } : {}),
    });
  }
}
