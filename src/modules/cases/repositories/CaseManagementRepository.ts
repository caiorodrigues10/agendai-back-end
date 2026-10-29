import { prisma } from "@/libs/prismaClient";
import type {
  CaseDocumentType,
  CaseEventType,
  CasePriority,
  CaseTaskStatus,
  ClientCaseStatus,
  DeadlineStatus,
  DeadlineType,
  Prisma,
} from "@prisma/client";
import type {
  ICaseDeadlineDTO,
  ICaseDocumentDTO,
  ICaseEventDTO,
  ICaseSummaryDTO,
  ICaseTaskDTO,
  IOfficeHolidayDTO,
} from "../dto/ICaseDTOs";

/**
 * Repositório da gestão de processos.
 *
 * Uma única classe concentration o acesso às tabelas de caso (tarefas,
 * prazos, andamentos, documentos) e aos feriados do escritório. As queries
 * sempre filtram por `barbershopId` — o isolamento é do tenant, e a RLS
 * (habilitada nas tabelas) é a segunda rede de proteção.
 */

export interface ListCasesFilters {
  status?: ClientCaseStatus;
  priority?: CasePriority;
  practiceArea?: string;
  clientId?: string;
  responsibleStaffId?: string;
  q?: string;
  includeArchived?: boolean;
  limit?: number;
}

export interface ListDeadlinesFilters {
  from?: Date;
  to?: Date;
  status?: DeadlineStatus;
  caseId?: string;
  withinBusinessDays?: number;
  limit?: number;
}

/**
 * Includes do caso com o contexto do escritório. Tipados por interface
 * local (não por `Prisma.*GetPayload`) para não estourar o limite de
 * complexidade do `tsc` neste repositório.
 */
const taskInclude = { assigneeStaff: { select: { id: true, name: true } } };
const deadlineInclude = { case: { select: { id: true, nickname: true } } };
const eventInclude = { createdByUser: { select: { id: true, name: true } } };
const documentInclude = { createdByUser: { select: { id: true, name: true } } };
const caseInclude = {
  client: { select: { id: true, name: true } },
  responsibleStaff: { select: { id: true, name: true } },
};

/** Caso com cliente e responsável (o que a listagem devolve). */
interface CaseWithContext {
  id: string;
  barbershopId: string;
  clientId: string;
  nickname: string;
  title: string | null;
  status: ClientCaseStatus;
  priority: CasePriority;
  practiceArea: string | null;
  caseNumber: string | null;
  courtName: string | null;
  opponent: string | null;
  claimedAmount: { toString(): string } | number | null;
  awardedAmount: { toString(): string } | number | null;
  responsibleStaffId: string | null;
  responsibleStaff: { id: string; name: string } | null;
  shareWithClient: boolean;
  client: { id: string; name: string };
  openedAt: Date;
  closedAt: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class CaseManagementRepository {
  // ─── Casos ────────────────────────────────────────────────────────────────

  async listCases(
    barbershopId: string,
    filters: ListCasesFilters
  ): Promise<ICaseSummaryDTO[]> {
    const where: Prisma.ClientCaseWhereInput = {
      barbershopId,
      ...(filters.status
        ? { status: filters.status }
        : filters.includeArchived
          ? {}
          : { status: { notIn: ["ARCHIVED"] } }),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.practiceArea ? { practiceArea: filters.practiceArea } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.responsibleStaffId
        ? { responsibleStaffId: filters.responsibleStaffId }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { nickname: { contains: filters.q, mode: "insensitive" } },
              { title: { contains: filters.q, mode: "insensitive" } },
              { caseNumber: { contains: filters.q, mode: "insensitive" } },
              { opponent: { contains: filters.q, mode: "insensitive" } },
              { client: { name: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const cases = (await prisma.clientCase.findMany({
      where,
      include: caseInclude,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: filters.limit ?? 100,
    })) as unknown as CaseWithContext[];

    return this.decorateCases(barbershopId, cases);
  }

  async findCaseById(
    barbershopId: string,
    caseId: string
  ): Promise<ICaseSummaryDTO | null> {
    const found = (await prisma.clientCase.findFirst({
      where: { id: caseId, barbershopId },
      include: caseInclude,
    })) as unknown as CaseWithContext | null;
    if (!found) return null;
    const [decorated] = await this.decorateCases(barbershopId, [found]);
    return decorated ?? null;
  }

  /** Contagem por status — Alimenta o quadro (pipeline) da tela de processos. */
  async countByStatus(barbershopId: string): Promise<Record<string, number>> {
    const grouped = await prisma.clientCase.groupBy({
      by: ["status"],
      where: { barbershopId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of grouped) counts[row.status] = row._count._all;
    return counts;
  }

  /** Preenche cliente, responsável e contadores de cada caso. */
  private async decorateCases(
    barbershopId: string,
    cases: CaseWithContext[]
  ): Promise<ICaseSummaryDTO[]> {
    if (cases.length === 0) return [];
    const caseIds = cases.map((item) => item.id);

    const [openTasks, pendingDeadlines, nextDeadlines] = await Promise.all([
      prisma.caseTask.groupBy({
        by: ["caseId"],
        where: { barbershopId, caseId: { in: caseIds }, status: "OPEN" },
        _count: { _all: true },
      }),
      prisma.caseDeadline.groupBy({
        by: ["caseId"],
        where: {
          barbershopId,
          caseId: { in: caseIds },
          status: "PENDING",
          dueDate: { gte: startOfToday() },
        },
        _count: { _all: true },
      }),
      prisma.caseDeadline.findMany({
        where: { barbershopId, caseId: { in: caseIds }, status: "PENDING" },
        orderBy: { dueDate: "asc" },
        select: { id: true, caseId: true, dueDate: true, title: true },
      }),
    ]);

    const tasksByCase = new Map(openTasks.map((row) => [row.caseId, row._count._all]));
    const deadlinesByCase = new Map(
      pendingDeadlines.map((row) => [row.caseId ?? "", row._count._all])
    );
    const nextByCase = new Map<string, (typeof nextDeadlines)[number]>();
    for (const deadline of nextDeadlines) {
      if (!deadline.caseId) continue;
      if (!nextByCase.has(deadline.caseId)) nextByCase.set(deadline.caseId, deadline);
    }

    return cases.map((item) => ({
      id: item.id,
      barbershopId: item.barbershopId,
      clientId: item.clientId,
      clientName: item.client.name,
      nickname: item.nickname,
      title: item.title,
      status: item.status,
      priority: item.priority,
      practiceArea: item.practiceArea,
      caseNumber: item.caseNumber,
      courtName: item.courtName,
      opponent: item.opponent,
      claimedAmount: item.claimedAmount ? Number(item.claimedAmount) : null,
      awardedAmount: item.awardedAmount ? Number(item.awardedAmount) : null,
      responsibleStaffId: item.responsibleStaffId,
      responsibleName: item.responsibleStaff?.name ?? null,
      shareWithClient: item.shareWithClient,
      openedAt: item.openedAt,
      closedAt: item.closedAt,
      active: item.active,
      openTasks: tasksByCase.get(item.id) ?? 0,
      pendingDeadlines: deadlinesByCase.get(item.id) ?? 0,
      nextDeadline: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }

  // ─── Tarefas ──────────────────────────────────────────────────────────────

  async listTasks(barbershopId: string, caseId: string): Promise<ICaseTaskDTO[]> {
    const tasks = await prisma.caseTask.findMany({
      where: { barbershopId, caseId },
      include: taskInclude,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    });
    return tasks.map((task) => ({
      id: task.id,
      barbershopId: task.barbershopId,
      caseId: task.caseId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeStaffId: task.assigneeStaffId,
      assigneeName: task.assigneeStaff?.name ?? null,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));
  }

  async createTask(
    barbershopId: string,
    caseId: string,
    data: {
      title: string;
      description?: string | null;
      status?: CaseTaskStatus;
      priority?: CasePriority;
      dueDate?: Date | null;
      assigneeStaffId?: string | null;
    }
  ): Promise<ICaseTaskDTO> {
    const task = await prisma.caseTask.create({
      data: {
        barbershopId,
        caseId,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? "OPEN",
        priority: data.priority ?? "NORMAL",
        dueDate: data.dueDate ?? null,
        assigneeStaffId: data.assigneeStaffId ?? null,
        completedAt:
          data.status === "DONE" ? new Date() : data.status === "CANCELED" ? new Date() : null,
      },
      include: taskInclude,
    });
    return {
      id: task.id,
      barbershopId: task.barbershopId,
      caseId: task.caseId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeStaffId: task.assigneeStaffId,
      assigneeName: task.assigneeStaff?.name ?? null,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  async updateTask(
    barbershopId: string,
    caseId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string | null;
      status?: CaseTaskStatus;
      priority?: CasePriority;
      dueDate?: Date | null;
      assigneeStaffId?: string | null;
    }
  ): Promise<ICaseTaskDTO | null> {
    const existing = await prisma.caseTask.findFirst({
      where: { id: taskId, barbershopId, caseId },
    });
    if (!existing) return null;

    const task = await prisma.caseTask.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.assigneeStaffId !== undefined && { assigneeStaffId: data.assigneeStaffId }),
        ...(data.status !== undefined && {
          status: data.status,
          completedAt:
            data.status === "OPEN" ? null : existing.completedAt ?? new Date(),
        }),
      },
      include: taskInclude,
    });
    return {
      id: task.id,
      barbershopId: task.barbershopId,
      caseId: task.caseId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeStaffId: task.assigneeStaffId,
      assigneeName: task.assigneeStaff?.name ?? null,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  async deleteTask(barbershopId: string, caseId: string, taskId: string): Promise<boolean> {
    const existing = await prisma.caseTask.findFirst({
      where: { id: taskId, barbershopId, caseId },
    });
    if (!existing) return false;
    await prisma.caseTask.delete({ where: { id: taskId } });
    return true;
  }

  /** Tarefas abertas do escritório (sem identificador de caso). */
  async listOpenTasks(
    barbershopId: string,
    limit: number
  ): Promise<
    Array<{
      id: string;
      title: string;
      dueDate: Date | null;
      priority: CasePriority;
    }>
  > {
    const tasks = await prisma.caseTask.findMany({
      where: { barbershopId, status: "OPEN" },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: { id: true, title: true, dueDate: true, priority: true },
    });
    return tasks;
  }

  // ─── Prazos ───────────────────────────────────────────────────────────────

  async listDeadlines(
    barbershopId: string,
    filters: ListDeadlinesFilters
  ): Promise<ICaseDeadlineDTO[]> {
    const deadlines = await prisma.caseDeadline.findMany({
      where: {
        barbershopId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.from || filters.to
          ? {
              dueDate: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: deadlineInclude,
      orderBy: { dueDate: "asc" },
      take: filters.limit ?? 100,
    });
    return deadlines.map((deadline) => ({
      id: deadline.id,
      barbershopId: deadline.barbershopId,
      caseId: deadline.caseId,
      caseName: deadline.case?.nickname ?? null,
      title: deadline.title,
      type: deadline.type,
      status: deadline.status,
      dueDate: deadline.dueDate,
      businessDays: deadline.businessDays,
      courtName: deadline.courtName,
      notes: deadline.notes,
      completedAt: deadline.completedAt,
      createdAt: deadline.createdAt,
      updatedAt: deadline.updatedAt,
      daysRemaining: null,
    }));
  }

  async createDeadline(
    barbershopId: string,
    caseId: string | null,
    data: {
      title: string;
      type?: DeadlineType;
      status?: DeadlineStatus;
      dueDate: Date;
      businessDays?: number | null;
      courtName?: string | null;
      notes?: string | null;
    }
  ): Promise<ICaseDeadlineDTO> {
    const deadline = await prisma.caseDeadline.create({
      data: {
        barbershopId,
        caseId,
        title: data.title,
        type: data.type ?? "JUDICIAL_RESPONSE",
        status: data.status ?? "PENDING",
        dueDate: data.dueDate,
        businessDays: data.businessDays ?? null,
        courtName: data.courtName ?? null,
        notes: data.notes ?? null,
        completedAt:
          data.status && data.status !== "PENDING" ? new Date() : null,
      },
      include: deadlineInclude,
    });
    return {
      id: deadline.id,
      barbershopId: deadline.barbershopId,
      caseId: deadline.caseId,
      caseName: deadline.case?.nickname ?? null,
      title: deadline.title,
      type: deadline.type,
      status: deadline.status,
      dueDate: deadline.dueDate,
      businessDays: deadline.businessDays,
      courtName: deadline.courtName,
      notes: deadline.notes,
      completedAt: deadline.completedAt,
      createdAt: deadline.createdAt,
      updatedAt: deadline.updatedAt,
      daysRemaining: null,
    };
  }

  async updateDeadline(
    barbershopId: string,
    deadlineId: string,
    data: {
      title?: string;
      type?: DeadlineType;
      status?: DeadlineStatus;
      dueDate?: Date;
      businessDays?: number | null;
      courtName?: string | null;
      notes?: string | null;
    }
  ): Promise<ICaseDeadlineDTO | null> {
    const existing = await prisma.caseDeadline.findFirst({
      where: { id: deadlineId, barbershopId },
    });
    if (!existing) return null;

    const deadline = await prisma.caseDeadline.update({
      where: { id: deadlineId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.courtName !== undefined && { courtName: data.courtName }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.businessDays !== undefined && { businessDays: data.businessDays }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.status !== undefined && {
          status: data.status,
          completedAt: data.status === "PENDING" ? null : existing.completedAt ?? new Date(),
        }),
      },
      include: deadlineInclude,
    });
    return {
      id: deadline.id,
      barbershopId: deadline.barbershopId,
      caseId: deadline.caseId,
      caseName: deadline.case?.nickname ?? null,
      title: deadline.title,
      type: deadline.type,
      status: deadline.status,
      dueDate: deadline.dueDate,
      businessDays: deadline.businessDays,
      courtName: deadline.courtName,
      notes: deadline.notes,
      completedAt: deadline.completedAt,
      createdAt: deadline.createdAt,
      updatedAt: deadline.updatedAt,
      daysRemaining: null,
    };
  }

  async deleteDeadline(barbershopId: string, deadlineId: string): Promise<boolean> {
    const existing = await prisma.caseDeadline.findFirst({
      where: { id: deadlineId, barbershopId },
    });
    if (!existing) return false;
    await prisma.caseDeadline.delete({ where: { id: deadlineId } });
    return true;
  }

  // ─── Andamentos ───────────────────────────────────────────────────────────

  async listEvents(barbershopId: string, caseId: string): Promise<ICaseEventDTO[]> {
    const events = await prisma.caseEvent.findMany({
      where: { barbershopId, caseId },
      include: eventInclude,
      orderBy: { occurredAt: "desc" },
    });
    return events.map((event) => ({
      id: event.id,
      barbershopId: event.barbershopId,
      caseId: event.caseId,
      type: event.type,
      title: event.title,
      description: event.description,
      occurredAt: event.occurredAt,
      createdByUserId: event.createdByUserId,
      visibleToClient: event.visibleToClient,
      authorName: event.createdByUser?.name ?? null,
      createdAt: event.createdAt,
    }));
  }

  async createEvent(
    barbershopId: string,
    caseId: string,
    data: {
      type?: CaseEventType;
      title: string;
      description?: string | null;
      occurredAt?: Date | null;
      createdByUserId?: string | null;
      visibleToClient?: boolean;
    }
  ): Promise<ICaseEventDTO> {
    const event = await prisma.caseEvent.create({
      data: {
        barbershopId,
        caseId,
        type: data.type ?? "NOTE",
        title: data.title,
        description: data.description ?? null,
        occurredAt: data.occurredAt ?? new Date(),
        createdByUserId: data.createdByUserId ?? null,
        visibleToClient: data.visibleToClient ?? false,
      },
      include: eventInclude,
    });
    return {
      id: event.id,
      barbershopId: event.barbershopId,
      caseId: event.caseId,
      type: event.type,
      title: event.title,
      description: event.description,
      occurredAt: event.occurredAt,
      createdByUserId: event.createdByUserId,
      visibleToClient: event.visibleToClient,
      authorName: event.createdByUser?.name ?? null,
      createdAt: event.createdAt,
    };
  }

  // ─── Documentos ───────────────────────────────────────────────────────────

  async listDocuments(barbershopId: string, caseId: string): Promise<ICaseDocumentDTO[]> {
    const documents = await prisma.caseDocument.findMany({
      where: { barbershopId, caseId },
      include: documentInclude,
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    });
    return documents.map((document) => ({
      id: document.id,
      barbershopId: document.barbershopId,
      caseId: document.caseId,
      title: document.title,
      type: document.type,
      fileUrl: document.fileUrl,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      version: document.version,
      notes: document.notes,
      createdByUserId: document.createdByUserId,
      authorName: document.createdByUser?.name ?? null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }));
  }

  async createDocument(
    barbershopId: string,
    caseId: string,
    data: {
      title: string;
      type?: CaseDocumentType;
      fileUrl?: string | null;
      fileName?: string | null;
      mimeType?: string | null;
      sizeBytes?: number | null;
      version?: number | null;
      notes?: string | null;
      createdByUserId?: string | null;
    }
  ): Promise<ICaseDocumentDTO> {
    const document = await prisma.caseDocument.create({
      data: {
        barbershopId,
        caseId,
        title: data.title,
        type: data.type ?? "OTHER",
        fileUrl: data.fileUrl ?? null,
        fileName: data.fileName ?? null,
        mimeType: data.mimeType ?? null,
        sizeBytes: data.sizeBytes ?? null,
        version: data.version ?? 1,
        notes: data.notes ?? null,
        createdByUserId: data.createdByUserId ?? null,
      },
      include: documentInclude,
    });
    return {
      id: document.id,
      barbershopId: document.barbershopId,
      caseId: document.caseId,
      title: document.title,
      type: document.type,
      fileUrl: document.fileUrl,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      version: document.version,
      notes: document.notes,
      createdByUserId: document.createdByUserId,
      authorName: document.createdByUser?.name ?? null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  async deleteDocument(
    barbershopId: string,
    caseId: string,
    documentId: string
  ): Promise<boolean> {
    const existing = await prisma.caseDocument.findFirst({
      where: { id: documentId, barbershopId, caseId },
    });
    if (!existing) return false;
    await prisma.caseDocument.delete({ where: { id: documentId } });
    return true;
  }

  // ─── Feriados do escritório ───────────────────────────────────────────────

  async listHolidays(
    barbershopId: string,
    filters: { from?: Date; to?: Date }
  ): Promise<IOfficeHolidayDTO[]> {
    const holidays = await prisma.officeHoliday.findMany({
      where: {
        barbershopId,
        ...(filters.from || filters.to
          ? {
              date: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
    });
    return holidays.map((holiday) => ({
      id: holiday.id,
      barbershopId: holiday.barbershopId,
      date: holiday.date,
      name: holiday.name,
      createdAt: holiday.createdAt,
    }));
  }

  async createHoliday(
    barbershopId: string,
    data: { date: Date; name: string }
  ): Promise<IOfficeHolidayDTO> {
    const holiday = await prisma.officeHoliday.create({
      data: { barbershopId, date: data.date, name: data.name },
    });
    return {
      id: holiday.id,
      barbershopId: holiday.barbershopId,
      date: holiday.date,
      name: holiday.name,
      createdAt: holiday.createdAt,
    };
  }

  async deleteHoliday(barbershopId: string, holidayId: string): Promise<boolean> {
    const existing = await prisma.officeHoliday.findFirst({
      where: { id: holidayId, barbershopId },
    });
    if (!existing) return false;
    await prisma.officeHoliday.delete({ where: { id: holidayId } });
    return true;
  }

  // ─── Financeiro do caso ───────────────────────────────────────────────────

  /** Honorários já cobrados no caso (atendimentos concluídos e vinculados). */
  async caseRevenue(barbershopId: string, caseId: string): Promise<{
    revenue: number;
    completedAppointments: number;
  }> {
    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId,
        caseId,
        status: "COMPLETED",
      },
      select: { finalPrice: true },
    });
    const revenue = appointments.reduce((sum, item) => sum + (item.finalPrice ?? 0), 0);
    return { revenue, completedAppointments: appointments.length };
  }

  /**
   * Relatório por área de atuação: casos, valores pretendidos/obtidos e
   * honorários já cobrados.
   */
  async practiceAreaReport(
    barbershopId: string
  ): Promise<
    Array<{
      practiceArea: string;
      total: number;
      active: number;
      closed: number;
      claimed: number;
      awarded: number;
      revenue: number;
    }>
  > {
    const cases = await prisma.clientCase.findMany({
      where: { barbershopId },
      select: {
        id: true,
        practiceArea: true,
        status: true,
        claimedAmount: true,
        awardedAmount: true,
      },
    });

    const appointments = await prisma.appointment.findMany({
      where: { barbershopId, status: "COMPLETED", caseId: { not: null } },
      select: { caseId: true, finalPrice: true },
    });

    const revenueByCase = new Map<string, number>();
    for (const appointment of appointments) {
      if (!appointment.caseId) continue;
      revenueByCase.set(
        appointment.caseId,
        (revenueByCase.get(appointment.caseId) ?? 0) + (appointment.finalPrice ?? 0)
      );
    }

    const byArea = new Map<
      string,
      {
        practiceArea: string;
        total: number;
        active: number;
        closed: number;
        claimed: number;
        awarded: number;
        revenue: number;
      }
    >();

    for (const item of cases) {
      const area = item.practiceArea?.trim() || "Sem área";
      const row =
        byArea.get(area) ??
        {
          practiceArea: area,
          total: 0,
          active: 0,
          closed: 0,
          claimed: 0,
          awarded: 0,
          revenue: 0,
        };
      row.total += 1;
      if (["CLOSED", "ARCHIVED"].includes(item.status)) row.closed += 1;
      else row.active += 1;
      row.claimed += item.claimedAmount ? Number(item.claimedAmount) : 0;
      row.awarded += item.awardedAmount ? Number(item.awardedAmount) : 0;
      row.revenue += revenueByCase.get(item.id) ?? 0;
      byArea.set(area, row);
    }

    return [...byArea.values()].sort((a, b) => b.revenue - a.revenue || b.total - a.total);
  }

  /** Saldo em aberto do cliente (fiado). */
  async clientOutstanding(barbershopId: string, clientId: string): Promise<number> {
    const fiados = await prisma.fiado.findMany({
      where: { barbershopId, clientId, status: { in: ["PENDING", "PARTIAL"] } },
      select: { originalAmount: true, paidAmount: true, creditAdjustedAmount: true },
    });
    return fiados.reduce(
      (sum, item) =>
        sum + (item.originalAmount - item.paidAmount - item.creditAdjustedAmount),
      0
    );
  }
}

/** Hoje à meia-noite UTC (date-only) — base dos filtros de prazo. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}
