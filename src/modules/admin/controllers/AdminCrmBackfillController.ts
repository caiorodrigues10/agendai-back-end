import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { adminCrmBackfillRunsQuerySchema } from "../schemas/adminCrmBackfillSchemas";

/**
 * Histórico de execuções do backfill de CRM (painel master).
 *
 * Cada execução do reprocessamento — por salão (TENANT) ou global (GLOBAL) —
 * vira um registro com quem disparou, início/fim, status, contadores e a
 * mensagem de erro quando falha.
 */
export class AdminCrmBackfillController {
  async runs(request: FastifyRequest, reply: FastifyReply) {
    const { page, limit, status, scope, barbershopId } =
      adminCrmBackfillRunsQuerySchema.parse(request.query);

    const where = {
      ...(status ? { status } : {}),
      ...(scope ? { scope } : {}),
      ...(barbershopId ? { barbershopId } : {}),
    };

    const [runs, total, runningGlobal] = await Promise.all([
      prisma.crmBackfillRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          barbershopId: true,
          version: true,
          status: true,
          scope: true,
          triggeredById: true,
          linkedRecords: true,
          createdEvents: true,
          totalEvents: true,
          error: true,
          startedAt: true,
          completedAt: true,
          barbershop: { select: { name: true } },
        },
      }),
      prisma.crmBackfillRun.count({ where }),
      // Independe dos filtros: é a trava do disparo global duplicado.
      prisma.crmBackfillRun.count({ where: { status: "RUNNING", scope: "GLOBAL" } }),
    ]);

    const userIds = [...new Set(runs.map((run) => run.triggeredById).filter(Boolean))] as string[];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    const data = runs.map((run) => ({
      id: run.id,
      barbershopId: run.barbershopId,
      barbershopName: run.barbershop?.name ?? null,
      version: run.version,
      status: run.status,
      scope: run.scope,
      linkedRecords: run.linkedRecords,
      createdEvents: run.createdEvents,
      totalEvents: run.totalEvents,
      error: run.error,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      triggeredBy: run.triggeredById
        ? (userById.get(run.triggeredById) ?? null)
        : null,
    }));

    return reply.status(200).send({
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        running: data.filter((run) => run.status === "RUNNING").length,
        runningGlobal,
      },
    });
  }
}
