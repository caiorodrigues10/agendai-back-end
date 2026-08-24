import { FastifyRequest, FastifyReply } from "fastify";
import { prisma, Prisma } from "@/libs/prismaClient";

export class ListRefundsController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, page = "1", limit = "20" } = request.query as {
      barbershopId?: string;
      page?: string;
      limit?: string;
    };

    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

    const where: Prisma.RefundWhereInput = {};
    if (barbershopId) {
      where.barbershopId = barbershopId;
    }

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
        orderBy: { createdAt: "desc" },
        include: {
          payment: {
            select: {
              id: true,
              transactionAmount: true,
              paymentMethod: true,
              status: true,
            },
          },
          barbershop: { select: { id: true, name: true } },
        },
      }),
      prisma.refund.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: refunds,
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  }
}