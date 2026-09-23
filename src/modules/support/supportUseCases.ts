import { AppError } from "@/shared/errors/AppError";
import { SupportRepository } from "./supportRepository";
import type { CreateReportInput, ListMyReportsQuery } from "./supportSchema";

export class SupportUseCases {
  private repo = new SupportRepository();

  async createReport(
    userId: string,
    barbershopId: string | null,
    input: CreateReportInput
  ) {
    const ticket = await this.repo.create({
      ...input,
      userId,
      barbershopId,
    });

    await this.repo.addHistory({
      ticketId: ticket.id,
      actorId: userId,
      field: "created",
      oldValue: null,
      newValue: "OPEN",
    });

    try {
      await this.repo.createAdminNotification({
        type: "CONTACT_MESSAGE",
        title: `Novo relatório: ${input.title}`.slice(0, 200),
        message: [
          `Protocolo: ${ticket.protocol}`,
          `Categoria: ${ticket.category}`,
          `Prioridade: ${ticket.priority}`,
          "",
          ticket.description.slice(0, 1000),
        ].join("\n"),
        metadata: JSON.stringify({
          ticketId: ticket.id,
          protocol: ticket.protocol,
          page: input.page ?? null,
          userAgent: input.userAgent ?? null,
        }),
      });
    } catch {
      // notificação de admin não bloqueia a criação do relatório
    }

    return ticket;
  }

  async listMyReports(userId: string, query: ListMyReportsQuery) {
    return this.repo.listMine(userId, query);
  }

  async getMyReport(userId: string, ticketId: string, role?: string) {
    const ticket = await this.repo.findById(ticketId);
    if (!ticket) throw new AppError("Relatório não encontrado", 404);
    if (ticket.createdById !== userId && role !== "MASTER_ADMIN") {
      throw new AppError("Acesso negado", 403);
    }
    return ticket;
  }

  async addComment(userId: string, ticketId: string, text: string, role?: string) {
    const ticket = await this.repo.findById(ticketId);
    if (!ticket) throw new AppError("Relatório não encontrado", 404);
    if (ticket.createdById !== userId && role !== "MASTER_ADMIN") {
      throw new AppError("Acesso negado", 403);
    }

    const comment = await this.repo.addComment(ticketId, userId, text);

    if (ticket.createdById === userId) {
      try {
        await this.repo.reactivateOnReply(ticketId, ticket.status, userId);
      } catch {
        // transição de status é best-effort — comentário já criado
      }
    }

    return comment;
  }
}
