import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

export class GetTicketUseCase {
  async execute(ticketId: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        protocol: true,
        title: true,
        description: true,
        channel: true,
        category: true,
        priority: true,
        status: true,
        barbershopId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        cancelledAt: true,
        cancelReason: true,
        resolveNote: true,
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        barbershop: { select: { id: true, name: true } },
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
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!ticket) {
      throw new AppError("Chamado não encontrado", 404);
    }

    return ticket;
  }
}
