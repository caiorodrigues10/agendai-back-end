import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";

export class AdminAuditLogController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { page = 1, limit = 20, userId, resource, action } = request.query as any;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};
    if (userId) where.userId = userId;
    if (resource) where.resource = resource;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: logs,
      meta: { total, page: Number(page), limit: take, totalPages: Math.ceil(total / take) },
    });
  }
}