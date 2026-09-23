import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_SHOP", "RESOLVED", "CANCELLED", "OPEN"],
  WAITING_SHOP: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["OPEN"],
  CANCELLED: ["OPEN"],
};

export class UpdateTicketUseCase {
  async execute(data: {
    ticketId: string;
    performedById: string;
    status?: string;
    priority?: string;
    assignedToId?: string | null;
    category?: string;
    cancelReason?: string;
    resolveNote?: string;
    version: number;
  }) {
    const { ticketId, performedById, version, ...updates } = data;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        priority: true,
        assignedToId: true,
        category: true,
        version: true,
      },
    });

    if (!ticket) {
      throw new AppError("Chamado não encontrado", 404);
    }

    if (ticket.version !== version) {
      throw new AppError(
        "Este chamado foi modificado por outra pessoa. Atualize e tente novamente.",
        409
      );
    }

    // Validate status transition
    if (updates.status && updates.status !== ticket.status) {
      const allowed = VALID_TRANSITIONS[ticket.status] ?? [];
      if (!allowed.includes(updates.status)) {
        throw new AppError(
          `Transição de ${ticket.status} para ${updates.status} não é permitida`,
          422
        );
      }

      // Status-specific validations
      if (updates.status === "IN_PROGRESS" && !updates.assignedToId && !ticket.assignedToId) {
        throw new AppError("É necessário atribuir um responsável para iniciar o atendimento", 422);
      }
      if (updates.status === "RESOLVED" && !updates.resolveNote?.trim()) {
        throw new AppError("É necessário informar a solução ao resolver um chamado", 422);
      }
      if (updates.status === "CANCELLED" && !updates.cancelReason?.trim()) {
        throw new AppError("É necessário informar o motivo ao cancelar um chamado", 422);
      }
    }

    // Validate assignedToId is active
    if (updates.assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: updates.assignedToId },
        select: { id: true, active: true, role: true },
      });
      if (!assignee || !assignee.active || assignee.role !== "MASTER_ADMIN") {
        throw new AppError("Responsável inválido ou inativo", 422);
      }
    }

    const historyEntries: any[] = [];
    const txData: any = {};

    // Track changes
    if (updates.status && updates.status !== ticket.status) {
      historyEntries.push({
        field: "status",
        oldValue: ticket.status,
        newValue: updates.status,
        reason: updates.status === "CANCELLED" ? updates.cancelReason : updates.status === "RESOLVED" ? updates.resolveNote : null,
      });
      txData.status = updates.status;
      if (updates.status === "RESOLVED") {
        txData.resolvedAt = new Date();
        txData.cancelledAt = null;
        txData.cancelReason = null;
      }
      if (updates.status === "CANCELLED") {
        txData.cancelledAt = new Date();
        txData.resolvedAt = null;
        txData.resolveNote = null;
      }
      if (updates.status === "OPEN") {
        txData.resolvedAt = null;
        txData.cancelledAt = null;
        txData.cancelReason = null;
        txData.resolveNote = null;
      }
      if (updates.cancelReason?.trim()) txData.cancelReason = updates.cancelReason.trim();
      if (updates.resolveNote?.trim()) txData.resolveNote = updates.resolveNote.trim();
    }

    if (updates.priority && updates.priority !== ticket.priority) {
      historyEntries.push({
        field: "priority",
        oldValue: ticket.priority,
        newValue: updates.priority,
      });
      txData.priority = updates.priority;
    }

    if (updates.assignedToId !== undefined && updates.assignedToId !== ticket.assignedToId) {
      historyEntries.push({
        field: "assignedToId",
        oldValue: ticket.assignedToId,
        newValue: updates.assignedToId,
      });
      txData.assignedToId = updates.assignedToId;
    }

    if (updates.category && updates.category !== ticket.category) {
      historyEntries.push({
        field: "category",
        oldValue: ticket.category,
        newValue: updates.category,
      });
      txData.category = updates.category;
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const write = await tx.ticket.updateMany({
        where: { id: ticketId, version },
        data: { ...txData, version: { increment: 1 } },
      });

      if (write.count !== 1) {
        throw new AppError(
          "Este chamado foi modificado por outra pessoa. Atualize e tente novamente.",
          409
        );
      }

      const result = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: {
          id: true,
          protocol: true,
          title: true,
          status: true,
          priority: true,
          assignedToId: true,
          category: true,
          version: true,
          updatedAt: true,
          assignedTo: { select: { id: true, name: true } },
        },
      });

      if (historyEntries.length > 0) {
        await tx.ticketHistory.createMany({
          data: historyEntries.map((h) => ({
            ticketId,
            actorId: performedById,
            field: h.field,
            oldValue: h.oldValue ?? null,
            newValue: h.newValue ?? null,
            reason: h.reason ?? null,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          userId: performedById,
          action: "UPDATE_TICKET",
          resource: "Ticket",
          resourceId: ticketId,
          details: JSON.stringify({ changes: historyEntries }),
        },
      });

      return result;
    });

    return updated;
  }
}
