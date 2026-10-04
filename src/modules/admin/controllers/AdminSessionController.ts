import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  hasInternalPermission,
  INTERNAL_PERMISSIONS,
} from "../internalPermissions";
import {
  revokeAllSessionsForUser,
  revokeSessionRow,
  sessionStatus,
} from "@/modules/auth/services/userSessionService";
import { adminSessionsQuerySchema } from "../schemas/adminSchemas";

type SessionWithUser = {
  id: string;
  userId: string;
  barbershopId: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  refreshTokenId: string | null;
  rememberedTokenId: string | null;
  user: { id: string; name: string; email: string; role: string; active: boolean };
};

const sessionSelect = {
  id: true,
  userId: true,
  barbershopId: true,
  deviceLabel: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  lastSeenAt: true,
  expiresAt: true,
  revokedAt: true,
  revokedReason: true,
  refreshTokenId: true,
  rememberedTokenId: true,
  user: { select: { id: true, name: true, email: true, role: true, active: true } },
} as const;

const toDto = (row: SessionWithUser, currentSid?: string) => ({
  id: row.id,
  userId: row.userId,
  userName: row.user.name,
  userEmail: row.user.email,
  userRole: row.user.role,
  barbershopId: row.barbershopId,
  deviceLabel: row.deviceLabel,
  ipAddress: row.ipAddress,
  userAgent: row.userAgent,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
  expiresAt: row.expiresAt,
  status: sessionStatus(row),
  revokedAt: row.revokedAt,
  revokedReason: row.revokedReason,
  current: row.id === currentSid,
});

/**
 * Sessões reais (`UserSession`, claim `sid`) — substitui a antiga heurística
 * agrupada por usuário+IP do access_log.
 */
export class AdminSessionController {
  /** GET /admin/sessions — lista sessões (MASTER_ADMIN + USERS_MANAGE). */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { page, limit, userId, status } = adminSessionsQuerySchema.parse(request.query);

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (status === "active") {
      where.revokedAt = null;
      where.expiresAt = { gt: new Date() };
    } else if (status === "revoked") {
      where.revokedAt = { not: null };
    } else if (status === "expired") {
      where.revokedAt = null;
      where.expiresAt = { lte: new Date() };
    }

    const [rows, total] = await Promise.all([
      prisma.userSession.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastSeenAt: "desc" },
        select: sessionSelect,
      }),
      prisma.userSession.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: rows.map((row: SessionWithUser) => toDto(row, request.user?.sid)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  }

  /**
   * POST /admin/sessions/:id/revoke — encerra UMA sessão/dispositivo.
   * Guards: motivo ≥10; `confirmSelf` ao encerrar a própria sessão atual;
   * só ADMIN (permissão ALL) encerra sessão de outro MASTER_ADMIN.
   */
  async revoke(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { reason, confirmSelf } = request.body as {
      reason: string;
      confirmSelf?: boolean;
    };

    const row = await prisma.userSession.findUnique({
      where: { id },
      select: sessionSelect,
    });
    if (!row) throw new AppError("Sessão não encontrada", 404);
    if (row.revokedAt) throw new AppError("Sessão já estava encerrada", 409);

    const isCurrent = row.userId === request.user?.id && row.id === request.user?.sid;
    if (isCurrent && confirmSelf !== true) {
      throw new AppError(
        "Você está encerrando a sessão atual deste navegador — confirme explicitamente para prosseguir",
        400,
        undefined,
        "CONFIRM_SELF_REQUIRED",
      );
    }

    if (
      row.user.role === "MASTER_ADMIN" &&
      !hasInternalPermission(request.user?.permissions, INTERNAL_PERMISSIONS.ALL)
    ) {
      throw new AppError("Apenas um administrador (perfil ADMIN) pode encerrar a sessão de outro administrador", 403);
    }

    await revokeSessionRow(row, { revokedById: request.user?.id, reason });

    await prisma.auditLog
      .create({
        data: {
          userId: request.user!.id,
          action: "SESSION_REVOKE",
          resource: "Session",
          resourceId: row.id,
          details: JSON.stringify({ targetUserId: row.userId, reason }),
          ipAddress: request.ip,
        },
      })
      .catch(() => undefined);

    return reply.status(200).send({
      success: true,
      data: { id: row.id, revoked: true, targetUserId: row.userId },
    });
  }

  /**
   * POST /admin/users/:id/revoke-all-sessions — encerra TODAS as sessões do
   * usuário (tokens + acessos imediatos).
   */
  async revokeAllForUser(request: FastifyRequest, reply: FastifyReply) {
    const { id: targetId } = request.params as { id: string };
    const { reason, confirmSelf } = request.body as {
      reason: string;
      confirmSelf?: boolean;
    };

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, name: true },
    });
    if (!target) throw new AppError("Usuário não encontrado", 404);

    if (targetId === request.user?.id && confirmSelf !== true) {
      throw new AppError(
        "Encerrar todas as sessões inclui esta sessão atual — confirme explicitamente para prosseguir",
        400,
        undefined,
        "CONFIRM_SELF_REQUIRED",
      );
    }

    if (
      target.role === "MASTER_ADMIN" &&
      !hasInternalPermission(request.user?.permissions, INTERNAL_PERMISSIONS.ALL)
    ) {
      throw new AppError("Apenas um administrador (perfil ADMIN) pode encerrar as sessões de outro administrador", 403);
    }

    const result = await revokeAllSessionsForUser(targetId, {
      revokedById: request.user?.id,
      reason,
    });

    await prisma.auditLog
      .create({
        data: {
          userId: request.user!.id,
          action: "USER_REVOKE_ALL_SESSIONS",
          resource: "User",
          resourceId: targetId,
          details: JSON.stringify({ reason, sessions: result.sessions, tokens: result.tokens }),
          ipAddress: request.ip,
        },
      })
      .catch(() => undefined);

    return reply.status(200).send({
      success: true,
      data: { targetUserId: targetId, ...result },
    });
  }
}
