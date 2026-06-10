import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

export class AdminNotificationController {
  /** GET /admin/notifications */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { page = "1", limit = "20", read, type } = request.query as {
      page?: string; limit?: string; read?: string; type?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Math.min(Number(limit), 100);

    const where: any = {};
    if (read !== undefined) where.read = read === "true";
    if (type) where.type = type;

    const [data, total, unreadCount] = await Promise.all([
      prisma.adminNotification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" }
      }),
      prisma.adminNotification.count({ where }),
      prisma.adminNotification.count({ where: { read: false } })
    ]);

    return reply.send({
      success: true,
      data,
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
        unreadCount
      }
    });
  }

  /** GET /admin/notifications/unread-count */
  async unreadCount(request: FastifyRequest, reply: FastifyReply) {
    const count = await prisma.adminNotification.count({ where: { read: false } });
    return reply.send({ success: true, data: { count } });
  }

  /** PATCH /admin/notifications/read-all */
  async markAllRead(request: FastifyRequest, reply: FastifyReply) {
    const { count } = await prisma.adminNotification.updateMany({
      where: { read: false },
      data: { read: true }
    });
    return reply.send({ success: true, message: `${count} notificações marcadas como lidas.` });
  }

  /** PATCH /admin/notifications/:id/read */
  async markRead(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const notification = await prisma.adminNotification.findUnique({ where: { id } });
    if (!notification) throw new AppError("Notificação não encontrada", 404);

    const updated = await prisma.adminNotification.update({
      where: { id },
      data: { read: true }
    });

    return reply.send({ success: true, data: updated });
  }
}