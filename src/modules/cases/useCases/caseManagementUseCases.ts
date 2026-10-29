import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  addBusinessDays,
  businessDaysUntil,
  toDateKey,
} from "@/shared/utils/businessDays";
import { CaseManagementRepository } from "../repositories/CaseManagementRepository";
import type {
  ICaseDeadlineDTO,
  ICaseDocumentDTO,
  ICaseEventDTO,
  ICaseOverviewDTO,
  ICaseSummaryDTO,
  ICaseTaskDTO,
  IOfficeHolidayDTO,
} from "../dto/ICaseDTOs";
import type {
  CreateCaseDocumentInput,
  CreateCaseEventInput,
  CreateCaseTaskInput,
  CreateDeadlineInput,
  CreateOfficeHolidayInput,
  ListCasesQuery,
  ListDeadlinesQuery,
  UpdateCaseTaskInput,
  UpdateDeadlineInput,
} from "../schemas/caseManagementSchemas";

export type RequestingUser = {
  id?: string;
  role: string;
  barbershopId?: string;
};

const STAFF_ROLES = ["MASTER_ADMIN", "OWNER", "EMPLOYEE"];

function assertStaffRole(user: RequestingUser): void {
  if (!STAFF_ROLES.includes(user.role)) {
    throw new AppError("Apenas profissionais do escritório podem gerenciar processos", 403);
  }
}

function assertShopAccess(user: RequestingUser, barbershopId: string): void {
  if (user.role === "MASTER_ADMIN") return;
  if (!user.barbershopId || user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: você não pertence a este escritório", 403);
  }
}

/**
 * Casos do escritório (visão de gestão, independente do cliente).
 *
 * Filtra por status/prioridade/área/cliente/responsável e devolve o caso com
 * o nome do cliente, do responsável e os contadores de tarefa e prazo.
 */
@injectable()
export class ListCasesUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: ListCasesQuery,
    user: RequestingUser
  ): Promise<ICaseSummaryDTO[]> {
    assertShopAccess(user, barbershopId);
    return this.repo.listCases(barbershopId, filters);
  }
}

/** Contagem por status — quadro (pipeline) da tela de processos. */
@injectable()
export class GetCasePipelineUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    user: RequestingUser
  ): Promise<Record<string, number>> {
    assertShopAccess(user, barbershopId);
    return this.repo.countByStatus(barbershopId);
  }
}

/** Detalhe de um caso (com cliente e responsável). */
@injectable()
export class GetCaseUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    user: RequestingUser
  ): Promise<ICaseSummaryDTO> {
    assertShopAccess(user, barbershopId);
    const found = await this.repo.findCaseById(barbershopId, caseId);
    if (!found) throw new AppError("Caso não encontrado", 404);
    return found;
  }
}

/**
 * Visão consolidada do caso: contadores, próximo prazo, financeiro e saldo
 * em aberto do cliente.
 */
@injectable()
export class GetCaseOverviewUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    user: RequestingUser
  ): Promise<ICaseOverviewDTO> {
    assertShopAccess(user, barbershopId);
    const found = await this.repo.findCaseById(barbershopId, caseId);
    if (!found) throw new AppError("Caso não encontrado", 404);

    const [tasks, deadlines, holidays, revenue, outstanding] = await Promise.all([
      this.repo.listTasks(barbershopId, caseId),
      this.repo.listDeadlines(barbershopId, { caseId, limit: 200 }),
      this.repo.listHolidays(barbershopId, {}),
      this.repo.caseRevenue(barbershopId, caseId),
      this.repo.clientOutstanding(barbershopId, found.clientId),
    ]);

    const today = toDateKey(new Date());
    const pending = deadlines.filter((deadline) => deadline.status === "PENDING");
    const overdue = pending.filter(
      (deadline) => toDateKey(deadline.dueDate) < today
    );
    const openTasks = tasks.filter((task) => task.status === "OPEN");
    const overdueTasks = openTasks.filter(
      (task) => task.dueDate && toDateKey(task.dueDate) < today
    );

    const decorated = pending.map((deadline) => ({
      ...deadline,
      daysRemaining: businessDaysUntil(new Date(), deadline.dueDate, holidays),
    }));

    return {
      case: found,
      tasks: {
        open: openTasks.length,
        done: tasks.filter((task) => task.status === "DONE").length,
        overdue: overdueTasks.length,
      },
      deadlines: {
        pending: pending.length,
        overdue: overdue.length,
        next: decorated[0] ?? null,
      },
      documents: 0,
      events: 0,
      revenue: revenue.revenue,
      completedAppointments: revenue.completedAppointments,
      outstanding,
    };
  }
}

// ─── Tarefas ────────────────────────────────────────────────────────────────

@injectable()
export class ListCaseTasksUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    user: RequestingUser
  ): Promise<ICaseTaskDTO[]> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    await this.assertCase(barbershopId, caseId);
    return this.repo.listTasks(barbershopId, caseId);
  }

  private async assertCase(barbershopId: string, caseId: string): Promise<void> {
    const found = await this.repo.findCaseById(barbershopId, caseId);
    if (!found) throw new AppError("Caso não encontrado", 404);
  }
}

@injectable()
export class CreateCaseTaskUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    data: CreateCaseTaskInput,
    user: RequestingUser
  ): Promise<ICaseTaskDTO> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const found = await this.repo.findCaseById(barbershopId, caseId);
    if (!found) throw new AppError("Caso não encontrado", 404);
    return this.repo.createTask(barbershopId, caseId, {
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate ?? null,
      assigneeStaffId: data.assigneeStaffId ?? null,
    });
  }
}

@injectable()
export class UpdateCaseTaskUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    taskId: string,
    data: UpdateCaseTaskInput,
    user: RequestingUser
  ): Promise<ICaseTaskDTO> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const updated = await this.repo.updateTask(barbershopId, caseId, taskId, {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.assigneeStaffId !== undefined && { assigneeStaffId: data.assigneeStaffId }),
    });
    if (!updated) throw new AppError("Tarefa não encontrada", 404);
    return updated;
  }
}

@injectable()
export class DeleteCaseTaskUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    taskId: string,
    user: RequestingUser
  ): Promise<void> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const deleted = await this.repo.deleteTask(barbershopId, caseId, taskId);
    if (!deleted) throw new AppError("Tarefa não encontrada", 404);
  }
}

/**
 * Tarefas abertas do escritório (sem dados de caso).
 *
 * Usado pelo assistente do dono (WhatsApp): devolve só título, prazo e
 * prioridade — o sigilo do processo vale também no bot.
 */
@injectable()
export class ListOpenCaseTasksUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    options: { limit?: number },
    user: RequestingUser
  ): Promise<Array<{ id: string; title: string; dueDate: string | null; priority: string }>> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const tasks = await this.repo.listOpenTasks(barbershopId, options.limit ?? 10);
    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
      priority: task.priority,
    }));
  }
}

// ─── Prazos ─────────────────────────────────────────────────────────────────

/**
 * Prazo do escritório ou do caso.
 *
 * A data final pode vir pronta (`dueDate`) ou ser calculada em dias úteis
 * (`businessDays`) a partir de uma data de referência — contando fins de
 * semana, feriados nacionais e as suspensões cadastradas pelo escritório.
 */
@injectable()
export class ListDeadlinesUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: ListDeadlinesQuery,
    user: RequestingUser
  ): Promise<ICaseDeadlineDTO[]> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);

    let effectiveFilters = { ...filters };
    if (filters.withinBusinessDays) {
      const holidays = await this.repo.listHolidays(barbershopId, {});
      const to = addBusinessDays(new Date(), filters.withinBusinessDays, holidays);
      effectiveFilters = { ...filters, to, from: filters.from ?? new Date() };
    }

    const [deadlines, holidays] = await Promise.all([
      this.repo.listDeadlines(barbershopId, effectiveFilters),
      this.repo.listHolidays(barbershopId, {}),
    ]);

    return deadlines.map((deadline) => ({
      ...deadline,
      daysRemaining: businessDaysUntil(new Date(), deadline.dueDate, holidays),
    }));
  }
}

@injectable()
export class CreateDeadlineUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string | null,
    data: CreateDeadlineInput,
    user: RequestingUser
  ): Promise<ICaseDeadlineDTO> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);

    if (caseId) {
      const found = await this.repo.findCaseById(barbershopId, caseId);
      if (!found) throw new AppError("Caso não encontrado", 404);
    }

    const dueDate = await this.resolveDueDate(barbershopId, data);
    return this.repo.createDeadline(barbershopId, caseId, {
      title: data.title,
      type: data.type,
      status: data.status,
      dueDate,
      businessDays: data.businessDays ?? null,
      courtName: data.courtName ?? null,
      notes: data.notes ?? null,
    });
  }

  /** Data final: a que veio pronta ou a contagem em dias úteis. */
  private async resolveDueDate(
    barbershopId: string,
    data: CreateDeadlineInput
  ): Promise<Date> {
    if (data.businessDays) {
      const holidays = await this.repo.listHolidays(barbershopId, {});
      const reference = data.referenceDate ?? new Date();
      return addBusinessDays(reference, data.businessDays, holidays);
    }
    if (data.dueDate) return data.dueDate;
    throw new AppError("Informe a data do prazo ou a contagem em dias úteis", 400);
  }
}

@injectable()
export class UpdateDeadlineUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    deadlineId: string,
    data: UpdateDeadlineInput,
    user: RequestingUser
  ): Promise<ICaseDeadlineDTO> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);

    const patch: {
      title?: string;
      type?: NonNullable<UpdateDeadlineInput["type"]>;
      status?: NonNullable<UpdateDeadlineInput["status"]>;
      dueDate?: Date;
      businessDays?: number | null;
      courtName?: string | null;
      notes?: string | null;
    } = {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.courtName !== undefined && { courtName: data.courtName }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.businessDays !== undefined && { businessDays: data.businessDays }),
    };

    if (data.businessDays) {
      const holidays = await this.repo.listHolidays(barbershopId, {});
      patch.dueDate = addBusinessDays(
        data.referenceDate ?? new Date(),
        data.businessDays,
        holidays
      );
    } else if (data.dueDate) {
      patch.dueDate = data.dueDate;
    }

    const updated = await this.repo.updateDeadline(barbershopId, deadlineId, patch);
    if (!updated) throw new AppError("Prazo não encontrado", 404);
    return updated;
  }
}

@injectable()
export class DeleteDeadlineUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    deadlineId: string,
    user: RequestingUser
  ): Promise<void> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const deleted = await this.repo.deleteDeadline(barbershopId, deadlineId);
    if (!deleted) throw new AppError("Prazo não encontrado", 404);
  }
}

// ─── Andamentos ─────────────────────────────────────────────────────────────

@injectable()
export class ListCaseEventsUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    user: RequestingUser
  ): Promise<ICaseEventDTO[]> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const found = await this.repo.findCaseById(barbershopId, caseId);
    if (!found) throw new AppError("Caso não encontrado", 404);
    return this.repo.listEvents(barbershopId, caseId);
  }
}

@injectable()
export class CreateCaseEventUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    data: CreateCaseEventInput,
    user: RequestingUser
  ): Promise<ICaseEventDTO> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const found = await this.repo.findCaseById(barbershopId, caseId);
    if (!found) throw new AppError("Caso não encontrado", 404);
    return this.repo.createEvent(barbershopId, caseId, {
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      occurredAt: data.occurredAt ?? null,
      createdByUserId: user.id ?? null,
      visibleToClient: data.visibleToClient ?? false,
    });
  }
}

// ─── Documentos ─────────────────────────────────────────────────────────────

@injectable()
export class ListCaseDocumentsUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    user: RequestingUser
  ): Promise<ICaseDocumentDTO[]> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const found = await this.repo.findCaseById(barbershopId, caseId);
    if (!found) throw new AppError("Caso não encontrado", 404);
    return this.repo.listDocuments(barbershopId, caseId);
  }
}

@injectable()
export class CreateCaseDocumentUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    data: CreateCaseDocumentInput,
    user: RequestingUser
  ): Promise<ICaseDocumentDTO> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const found = await this.repo.findCaseById(barbershopId, caseId);
    if (!found) throw new AppError("Caso não encontrado", 404);
    return this.repo.createDocument(barbershopId, caseId, {
      title: data.title,
      type: data.type,
      fileUrl: data.fileUrl ?? null,
      fileName: data.fileName ?? null,
      mimeType: data.mimeType ?? null,
      sizeBytes: data.sizeBytes ?? null,
      version: data.version ?? null,
      notes: data.notes ?? null,
      createdByUserId: user.id ?? null,
    });
  }
}

@injectable()
export class DeleteCaseDocumentUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    documentId: string,
    user: RequestingUser
  ): Promise<void> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const deleted = await this.repo.deleteDocument(barbershopId, caseId, documentId);
    if (!deleted) throw new AppError("Documento não encontrado", 404);
  }
}

// ─── Feriados do escritório ─────────────────────────────────────────────────

@injectable()
export class ListOfficeHolidaysUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: { from?: Date; to?: Date },
    user: RequestingUser
  ): Promise<IOfficeHolidayDTO[]> {
    assertShopAccess(user, barbershopId);
    return this.repo.listHolidays(barbershopId, filters);
  }
}

@injectable()
export class CreateOfficeHolidayUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    data: CreateOfficeHolidayInput,
    user: RequestingUser
  ): Promise<IOfficeHolidayDTO> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    return this.repo.createHoliday(barbershopId, {
      date: data.date,
      name: data.name,
    });
  }
}

@injectable()
export class DeleteOfficeHolidayUseCase {
  constructor(
    @inject("CaseManagementRepository")
    private repo: CaseManagementRepository
  ) {}

  async execute(
    barbershopId: string,
    holidayId: string,
    user: RequestingUser
  ): Promise<void> {
    assertShopAccess(user, barbershopId);
    assertStaffRole(user);
    const deleted = await this.repo.deleteHoliday(barbershopId, holidayId);
    if (!deleted) throw new AppError("Feriado não encontrado", 404);
  }
}
