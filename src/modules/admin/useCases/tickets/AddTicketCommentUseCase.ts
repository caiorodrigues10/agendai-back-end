import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

export class AddTicketCommentUseCase {
  async execute(data: {
    ticketId: string;
    authorId: string;
    text: string;
  }) {
    const { ticketId, authorId, text } = data;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });

    if (!ticket) {
      throw new AppError("Chamado não encontrado", 404);
    }

    const comment = await prisma.ticketComment.create({
      data: { ticketId, authorId, text },
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
