import { prisma } from "@/libs/prismaClient";

export class ListTasksUseCase {
  async execute(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
    assignedToId?: string;
    barbershopId?: string;
    ticketId?: string;
    dueBefore?: string;
    dueAfter?: string;
  }) {
    const { page = 1, limit = 25, search, ...filters } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.barbershopId) where.barbershopId = filters.barbershopId;
    if (filters.ticketId) where.ticketId = filters.ticketId;

    if (filters.dueBefore || filters.dueAfter) {
      where.dueDate = {};
      if (filters.dueBefore) where.dueDate.lte = new Date(filters.dueBefore);
      if (filters.dueAfter) where.dueDate.gte = new Date(filters.dueAfter);
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          barbershopId: true,
          ticketId: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          createdBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          barbershop: { select: { id: true, name: true } },
          ticket: { select: { id: true, protocol: true, title: true } },
          _count: { select: { comments: true, history: true } },
        },
        orderBy: [
          { priority: "desc" },
          { dueDate: "asc" },
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    return {
      data: tasks,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
