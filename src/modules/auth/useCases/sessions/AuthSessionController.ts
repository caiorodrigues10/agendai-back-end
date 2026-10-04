import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { revokeSessionRow, sessionStatus } from "../../services/userSessionService";
import { getAuthCookieSecurityOptions } from "../../utils/authCookieOptions";

type OwnSessionRow = {
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
};

const ownSelect = {
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
} as const;

/** "Meus dispositivos" — listar e encerrar sessões do próprio usuário. */
export class AuthSessionController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const rows: OwnSessionRow[] = await prisma.userSession.findMany({
      where: { userId: request.user!.id },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
      select: ownSelect,
    });

    return reply.status(200).send({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        deviceLabel: row.deviceLabel,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        expiresAt: row.expiresAt,
        status: sessionStatus(row),
        revokedAt: row.revokedAt,
        revokedReason: row.revokedReason,
        current: row.id === request.user?.sid,
      })),
    });
  }

  async revoke(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { reason?: string; confirmSelf?: boolean };

    const row = await prisma.userSession.findUnique({
      where: { id },
      select: ownSelect,
    });
    if (!row || row.userId !== request.user!.id) {
      throw new AppError("Sessão não encontrada", 404);
    }
    if (row.revokedAt) throw new AppError("Sessão já estava encerrada", 409);

    const isCurrent = row.id === request.user?.sid;
    if (isCurrent && body.confirmSelf !== true) {
      throw new AppError(
        "Você está encerrando a sessão atual deste navegador — confirme explicitamente para prosseguir",
        400,
        undefined,
        "CONFIRM_SELF_REQUIRED",
      );
    }

    const reason = body.reason?.trim() || "encerrada pelo próprio usuário";
    await revokeSessionRow(row, { reason });

    await prisma.auditLog
      .create({
        data: {
          userId: request.user!.id,
          action: "SESSION_REVOKE_SELF",
          resource: "Session",
          resourceId: row.id,
          details: JSON.stringify({ reason, current: isCurrent }),
          ipAddress: request.ip,
          barbershopId: row.barbershopId,
        },
      })
      .catch(() => undefined);

    if (isCurrent) {
      reply.setCookie("refresh_token", "", { ...getAuthCookieSecurityOptions(), maxAge: 0 });
      reply.setCookie(`saved_refresh_${request.user!.id}`, "", {
        ...getAuthCookieSecurityOptions(),
        maxAge: 0,
      });
    }

    return reply.status(200).send({
      success: true,
      data: { id: row.id, revoked: true, current: isCurrent },
    });
  }
}
