import { prisma } from "@/libs/prismaClient";

export class ListTicketsUseCase {
  async execute(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
    assignedToId?: string;
    barbershopId?: string;
    channel?: string;
    category?: string;
    unassigned?: boolean;
    userId?: string;
  }) {
    const { page = 1, limit = 25, search, userId, ...filters } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { protocol: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
      ];
    }

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.barbershopId) where.barbershopId = filters.barbershopId;
    if (filters.channel) where.channel = filters.channel;
    if (filters.category) where.category = filters.category;
    if (filters.unassigned) where.assignedToId = null;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        select: {
          id: true,
          protocol: true,
          title: true,
          channel: true,
          category: true,
          priority: true,
          status: true,
          barbershopId: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          createdBy: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true } },
          barbershop: { select: { id: true, name: true } },
          _count: { select: { comments: true, history: true, tasks: true } },
        },
        orderBy: [
          { priority: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    return {
      data: tickets,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
