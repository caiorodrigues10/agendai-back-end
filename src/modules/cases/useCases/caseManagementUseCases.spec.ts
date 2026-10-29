import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateCaseTaskUseCase,
  CreateDeadlineUseCase,
  GetCaseOverviewUseCase,
  ListCasesUseCase,
  ListDeadlinesUseCase,
  UpdateCaseTaskUseCase,
} from "./caseManagementUseCases";
import type { CaseManagementRepository } from "../repositories/CaseManagementRepository";

const SHOP = "shop-1";
const OTHER_SHOP = "shop-2";
const CASE_ID = "case-1";
const CLIENT_ID = "client-1";

const owner = { id: "user-1", role: "OWNER", barbershopId: SHOP };
const outsider = { id: "user-2", role: "OWNER", barbershopId: OTHER_SHOP };

function makeRepo(overrides: Partial<CaseManagementRepository> = {}) {
  return {
    listCases: vi.fn(async () => []),
    findCaseById: vi.fn(async () => null),
    countByStatus: vi.fn(async () => ({})),
    listTasks: vi.fn(async () => []),
    createTask: vi.fn(async () => ({
      id: "task-1",
      barbershopId: SHOP,
      caseId: CASE_ID,
      title: "Preparar contestação",
      description: null,
      status: "OPEN" as const,
      priority: "NORMAL" as const,
      dueDate: null,
      assigneeStaffId: null,
      assigneeName: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    updateTask: vi.fn(async () => null),
    deleteTask: vi.fn(async () => false),
    listDeadlines: vi.fn(async () => []),
    createDeadline: vi.fn(async (_shop: string, _caseId: string | null, data: any) => ({
      id: "deadline-1",
      barbershopId: SHOP,
      caseId: _caseId,
      caseName: null,
      title: data.title,
      type: data.type ?? "JUDICIAL_RESPONSE",
      status: data.status ?? ("PENDING" as const),
      dueDate: data.dueDate,
      businessDays: data.businessDays ?? null,
      courtName: data.courtName ?? null,
      notes: data.notes ?? null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      daysRemaining: null,
    })),
    updateDeadline: vi.fn(async () => null),
    deleteDeadline: vi.fn(async () => false),
    listEvents: vi.fn(async () => []),
    createEvent: vi.fn(async () => ({}) as never),
    listDocuments: vi.fn(async () => []),
    createDocument: vi.fn(async () => ({}) as never),
    deleteDocument: vi.fn(async () => false),
    listHolidays: vi.fn(async () => []),
    createHoliday: vi.fn(async () => ({}) as never),
    deleteHoliday: vi.fn(async () => false),
    caseRevenue: vi.fn(async () => ({ revenue: 0, completedAppointments: 0 })),
    clientOutstanding: vi.fn(async () => 0),
    practiceAreaReport: vi.fn(async () => []),
    ...overrides,
  } as unknown as CaseManagementRepository;
}

function caseSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    barbershopId: SHOP,
    clientId: CLIENT_ID,
    clientName: "Maria",
    nickname: "Ação de cobrança",
    title: null,
    status: "ACTIVE" as const,
    priority: "NORMAL" as const,
    practiceArea: "Cível",
    caseNumber: null,
    courtName: null,
    opponent: null,
    claimedAmount: null,
    awardedAmount: null,
    responsibleStaffId: null,
    responsibleName: null,
    openedAt: new Date(),
    closedAt: null,
    active: true,
    openTasks: 0,
    pendingDeadlines: 0,
    nextDeadline: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("gestão de processos — use cases", () => {
  let repo: CaseManagementRepository;

  beforeEach(() => {
    repo = makeRepo();
  });

  it("nega acesso de usuário de outro escritório", async () => {
    const useCase = new ListCasesUseCase(repo);
    await expect(useCase.execute(SHOP, {}, outsider)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lista os casos do escritório", async () => {
    const listCases = vi.fn(async () => [caseSummary()]);
    const useCase = new ListCasesUseCase(makeRepo({ listCases } as never));
    const result = await useCase.execute(SHOP, { status: "ACTIVE" }, owner);
    expect(result).toHaveLength(1);
    expect(listCases).toHaveBeenCalledWith(SHOP, { status: "ACTIVE" });
  });

  it("cria tarefa no caso e recusa caso inexistente", async () => {
    const useCase = new CreateCaseTaskUseCase(makeRepo());
    await expect(
      useCase.execute(SHOP, CASE_ID, { title: "Preparar contestação" }, owner)
    ).rejects.toMatchObject({ statusCode: 404 });

    const withCase = new CreateCaseTaskUseCase(
      makeRepo({ findCaseById: vi.fn(async () => caseSummary()) } as never)
    );
    const task = await withCase.execute(SHOP, CASE_ID, { title: "Preparar contestação" }, owner);
    expect(task.title).toBe("Preparar contestação");
  });

  it("recusa tarefa inexistente na atualização", async () => {
    const useCase = new UpdateCaseTaskUseCase(repo);
    await expect(
      useCase.execute(SHOP, CASE_ID, "task-9", { title: "x" }, owner)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("calcula a data do prazo em dias úteis (pulando fim de semana)", async () => {
    const createDeadline = vi.fn(async (_s: string, _c: string | null, data: any) => ({
      id: "deadline-1",
      barbershopId: SHOP,
      caseId: _c,
      caseName: null,
      title: data.title,
      type: data.type ?? "JUDICIAL_RESPONSE",
      status: data.status ?? ("PENDING" as const),
      dueDate: data.dueDate,
      businessDays: data.businessDays ?? null,
      courtName: null,
      notes: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      daysRemaining: null,
    }));
    const useCase = new CreateDeadlineUseCase(
      makeRepo({
        createDeadline,
        findCaseById: vi.fn(async () => caseSummary()),
      } as never)
    );

    // 30/10/2026 é sexta; +1 dia útil = 03/11 (terça), pois 02/11 é Finados.
    const deadline = await useCase.execute(
      SHOP,
      CASE_ID,
      { title: "Contestação", businessDays: 1, referenceDate: new Date("2026-10-30T00:00:00Z") },
      owner
    );

    expect(new Date(deadline.dueDate).toISOString().slice(0, 10)).toBe("2026-11-03");
    expect(deadline.businessDays).toBe(1);
  });

  it("exige data ou contagem em dias úteis no prazo", async () => {
    const useCase = new CreateDeadlineUseCase(
      makeRepo({ findCaseById: vi.fn(async () => caseSummary()) } as never)
    );
    await expect(
      useCase.execute(SHOP, CASE_ID, { title: "Contestação" }, owner)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("devolve os dias úteis restantes de cada prazo", async () => {
    const listDeadlines = vi.fn(async () => [
      {
        id: "deadline-1",
        barbershopId: SHOP,
        caseId: CASE_ID,
        caseName: "Ação",
        title: "Contestação",
        type: "JUDICIAL_RESPONSE" as const,
        status: "PENDING" as const,
        dueDate: new Date("2026-11-03T00:00:00Z"),
        businessDays: null,
        courtName: null,
        notes: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        daysRemaining: null,
      },
    ]);
    const useCase = new ListDeadlinesUseCase(makeRepo({ listDeadlines } as never));
    const deadlines = await useCase.execute(SHOP, {}, owner);
    expect(typeof deadlines[0].daysRemaining).toBe("number");
  });

  it("monta a visão consolidada do caso", async () => {
    const repoWithData = makeRepo({
      findCaseById: vi.fn(async () => caseSummary()),
      listTasks: vi.fn(async () => [
        {
          id: "task-1",
          barbershopId: SHOP,
          caseId: CASE_ID,
          title: "Conferir documentos",
          description: null,
          status: "OPEN" as const,
          priority: "NORMAL" as const,
          dueDate: null,
          assigneeStaffId: null,
          assigneeName: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      listDeadlines: vi.fn(async () => []),
      caseRevenue: vi.fn(async () => ({ revenue: 1200, completedAppointments: 3 })),
      clientOutstanding: vi.fn(async () => 300),
    } as never);

    const useCase = new GetCaseOverviewUseCase(repoWithData);
    const overview = await useCase.execute(SHOP, CASE_ID, owner);

    expect(overview.tasks.open).toBe(1);
    expect(overview.tasks.done).toBe(0);
    expect(overview.revenue).toBe(1200);
    expect(overview.completedAppointments).toBe(3);
    expect(overview.outstanding).toBe(300);
  });
});
