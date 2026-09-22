import { prisma } from "@/libs/prismaClient";

export class CreateTaskUseCase {
  async execute(data: {
    title: string;
    description?: string;
    priority?: string;
    assignedToId?: string | null;
    dueDate?: string;
    barbershopId?: string | null;
    ticketId?: string | null;
    createdById: string;
  }) {
    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        priority: (data.priority as any) ?? "NORMAL",
        assignedToId: data.assignedToId ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        barbershopId: data.barbershopId ?? null,
        ticketId: data.ticketId ?? null,
        createdById: data.createdById,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        barbershopId: true,
        ticketId: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: data.createdById,
        action: "CREATE_TASK",
        resource: "Task",
        resourceId: task.id,
        details: JSON.stringify({ title: data.title }),
      },
    });

    return task;
  }
}
