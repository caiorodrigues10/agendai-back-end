import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

export class AddTaskCommentUseCase {
  async execute(data: {
    taskId: string;
    authorId: string;
    text: string;
  }) {
    const { taskId, authorId, text } = data;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    const comment = await prisma.taskComment.create({
      data: { taskId, authorId, text },
      select: {
        id: true,
        text: true,
        createdAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    return comment;
  }
}
