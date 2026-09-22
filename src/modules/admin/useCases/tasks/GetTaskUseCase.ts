import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

export class GetTaskUseCase {
  async execute(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        barbershopId: true,
        ticketId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        completedBy: { select: { id: true, name: true } },
        barbershop: { select: { id: true, name: true } },
        ticket: { select: { id: true, protocol: true, title: true } },
        comments: {
          select: {
            id: true,
            text: true,
            createdAt: true,
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        history: {
          select: {
            id: true,
            field: true,
            oldValue: true,
            newValue: true,
            reason: true,
            createdAt: true,
            actor: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    return task;
  }
}
