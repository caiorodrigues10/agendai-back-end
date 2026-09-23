import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";

const VALID_TASK_TRANSITIONS: Record<string, string[]> = {
  TODO: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "DONE", "CANCELLED", "TODO"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  DONE: ["TODO"],
  CANCELLED: ["TODO"],
};

export class UpdateTaskUseCase {
  async execute(data: {
    taskId: string;
    performedById: string;
    status?: string;
    priority?: string;
    assignedToId?: string | null;
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    reason?: string;
    version: number;
  }) {
    const { taskId, performedById, version, ...updates } = data;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
        priority: true,
        assignedToId: true,
        title: true,
        description: true,
        dueDate: true,
        version: true,
      },
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada", 404);
    }

    if (task.version !== version) {
      throw new AppError(
        "Esta tarefa foi modificada por outra pessoa. Atualize e tente novamente.",
        409
      );
    }

    // Validate status transition
    if (updates.status && updates.status !== task.status) {
      const allowed = VALID_TASK_TRANSITIONS[task.status] ?? [];
      if (!allowed.includes(updates.status)) {
        throw new AppError(
          `Transição de ${task.status} para ${updates.status} não é permitida`,
          422
        );
      }

      if (updates.status === "IN_PROGRESS" && !updates.assignedToId && !task.assignedToId) {
        throw new AppError("É necessário atribuir um responsável para iniciar a tarefa", 422);
      }

      if (updates.status === "BLOCKED" && !updates.reason?.trim()) {
        throw new AppError("É necessário informar o motivo ao bloquear uma tarefa", 422);
      }
    }

    // Validate assignee
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

    if (updates.status && updates.status !== task.status) {
      historyEntries.push({
        field: "status",
        oldValue: task.status,
        newValue: updates.status,
        reason: updates.reason ?? null,
      });
      txData.status = updates.status;
      if (updates.status === "DONE") {
        txData.completedAt = new Date();
        txData.completedById = performedById;
      }
      if (updates.status === "TODO") {
        txData.completedAt = null;
        txData.completedById = null;
      }
    }

    if (updates.priority && updates.priority !== task.priority) {
      historyEntries.push({ field: "priority", oldValue: task.priority, newValue: updates.priority });
      txData.priority = updates.priority;
    }

    if (updates.assignedToId !== undefined && updates.assignedToId !== task.assignedToId) {
      historyEntries.push({ field: "assignedToId", oldValue: task.assignedToId, newValue: updates.assignedToId });
      txData.assignedToId = updates.assignedToId;
    }

    if (updates.title && updates.title !== task.title) {
      historyEntries.push({ field: "title", oldValue: task.title, newValue: updates.title });
      txData.title = updates.title;
    }

    if (updates.description !== undefined && updates.description !== task.description) {
      historyEntries.push({
        field: "description",
        oldValue: task.description,
        newValue: updates.description,
      });
      txData.description = updates.description;
    }

    if (updates.dueDate !== undefined) {
      const nextDueDate = updates.dueDate ? new Date(updates.dueDate) : null;
      const currentDueDate = task.dueDate?.toISOString() ?? null;
      const nextDueDateKey = nextDueDate?.toISOString() ?? null;

      if (nextDueDateKey !== currentDueDate) {
        historyEntries.push({
          field: "dueDate",
          oldValue: currentDueDate,
          newValue: nextDueDateKey,
        });
        txData.dueDate = nextDueDate;
      }
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const write = await tx.task.updateMany({
        where: { id: taskId, version },
        data: { ...txData, version: { increment: 1 } },
      });

      if (write.count !== 1) {
        throw new AppError(
          "Esta tarefa foi modificada por outra pessoa. Atualize e tente novamente.",
          409
        );
      }

      const result = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          assignedToId: true,
          dueDate: true,
          version: true,
          updatedAt: true,
          completedAt: true,
          assignedTo: { select: { id: true, name: true } },
        },
      });

      if (historyEntries.length > 0) {
        await tx.taskHistory.createMany({
          data: historyEntries.map((h) => ({
            taskId,
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
          action: "UPDATE_TASK",
          resource: "Task",
          resourceId: taskId,
          details: JSON.stringify({ changes: historyEntries }),
        },
      });

      return result;
    });

    return updated;
  }
}
