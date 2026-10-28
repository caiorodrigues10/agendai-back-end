import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerBotService } from "./ownerBotService";
import { InMemoryOwnerBotStore } from "./ownerBotStore";
import { hashOwnerBotLinkCode } from "./linkCode";
import type { OwnerBotActions } from "./ownerBotActions";
import type { OwnerBotInsights } from "./ownerBotActions";
import type { OwnerBotMessenger } from "./ownerBotMessenger";

function emptyInsights(): OwnerBotInsights {
  return {
    period: "30d",
    kpis: {
      revenue: 1500,
      completedServices: 25,
      avgTicket: 60,
      expenses: 300,
      netProfit: 700,
      openFiado: 100,
      overdueFiado: 0,
      uniqueCustomers: 20,
      returningCustomerRate: 0.5,
    },
    byWeekday: [],
    byHour: [],
    topServices: [],
    byStaff: [],
    inactiveCustomers: [],
    highlights: [],
  };
}

const OWNER_PHONE = "551199999999";
const SHOP_PHONE = "551199999999";
const OTHER_PHONE = "551188888888";

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    userId: "user-1",
    barbershopId: "shop-1",
    normalizedPhone: OWNER_PHONE,
    linkedAt: new Date("2026-10-01T00:00:00Z"),
    user: { id: "user-1", name: "Dona Marina", role: "OWNER", active: true },
    barbershop: {
      id: "shop-1",
      name: "Studio Marina",
      businessSegment: "HAIR_SALON",
      whatsapp: SHOP_PHONE,
      active: true,
    },
    ...overrides,
  };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findActiveLinksByPhone: vi.fn(async () => [makeLink()]),
    findPendingLinkCode: vi.fn(async () => null),
    incrementLinkCodeAttempts: vi.fn(async () => ({ attempts: 1, maxAttempts: 5 })),
    consumeLinkCode: vi.fn(async () => undefined),
    findShop: vi.fn(async () => ({
      id: "shop-1",
      name: "Studio Marina",
      businessSegment: "HAIR_SALON",
      whatsapp: SHOP_PHONE,
      active: true,
    })),
    findUser: vi.fn(async () => ({ id: "user-1", name: "Dona Marina", role: "OWNER", active: true })),
    findActiveLinkByPhoneAndShop: vi.fn(async () => null),
    revokeLinksOfOtherUsers: vi.fn(async () => 0),
    createLink: vi.fn(async () => ({ id: "link-1" })),
    logAction: vi.fn(async () => "log-1"),
    touchLink: vi.fn(async () => undefined),
    revokeLink: vi.fn(async () => undefined),
    findActiveLinksByUser: vi.fn(async () => [
      { id: "link-1", barbershopId: "shop-1", normalizedPhone: OWNER_PHONE, linkedAt: new Date(), barbershop: makeLink().barbershop },
    ]),
    getPreferences: vi.fn(async () => null),
    upsertPreferences: vi.fn(async () => ({})),
    markActionUndone: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeActions(overrides: Partial<OwnerBotActions> = {}): OwnerBotActions {
  return {
    listServices: vi.fn(async () => [
      { id: "service-1", name: "Corte", price: 60, avgTimeMinutes: 40 },
    ]),
    listAppointments: vi.fn(async () => []),
    listAppointmentsRange: vi.fn(async () => []),
    listWaitingQueue: vi.fn(async () => []),
    queueMetrics: vi.fn(async () => ({ waiting: 0, inService: 0 })),
    availability: vi.fn(async () => []),
    createAppointment: vi.fn(async () => ({
      id: "appt-1",
      barbershopId: "shop-1",
      serviceId: "service-1",
      staffId: null,
      customerName: "Joana",
      whatsapp: OTHER_PHONE,
      date: new Date("2026-10-28T00:00:00Z"),
      time: "10:30",
      status: "CONFIRMED" as const,
      source: "WHATSAPP_OWNER_BOT" as const,
      serviceName: "Corte",
      servicePrice: 60,
      staffName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    cancelAppointment: vi.fn(async () => undefined),
    rescheduleAppointment: vi.fn(async () => ({} as never)),
    checkIn: vi.fn(async () => ({ queueItemId: "queue-1" })),
    completeAppointment: vi.fn(async () => ({})),
    markNoShow: vi.fn(async () => ({})),
    joinQueue: vi.fn(async () => ({} as never)),
    listWaitlist: vi.fn(async () => []),
    offerWaitlistSlot: vi.fn(async () => ({})),
    removeWaitlistEntry: vi.fn(async () => undefined),
    listClients: vi.fn(async () => []),
    getClient: vi.fn(async () => ({ id: "client-1", name: "Joana", whatsapp: OTHER_PHONE }) as never),
    createClient: vi.fn(async () => ({} as never)),
    updateClient: vi.fn(async () => ({} as never)),
    listCrmClients: vi.fn(async () => []),
    getCrmClient: vi.fn(async () => ({})),
    insights: vi.fn(async () => emptyInsights()),
    periodProfit: vi.fn(async () => ({
      totals: { revenue: 0, directCosts: 0, overheadCosts: 0, operationalCosts: 0, taxAmount: 0, commissionAmt: 0, netProfit: 0, marginPercent: 0 },
      byService: [],
      byStaff: [],
    })),
    profitTrend: vi.fn(async () => []),
    cashSummary: vi.fn(async () => ({ summary: {}, totalMovements: 0 })),
    dayFigures: vi.fn(async () => ({
      cashReceived: 100,
      pixReceived: 50,
      cardReceived: 30,
      fiadoCreated: 0,
      fiadoPaid: 0,
      expenses: 0,
      commissions: 0,
      productSales: 0,
    })),
    computePeriodProfit: vi.fn(async () => ({
      totals: {},
      summary: {
        totalAppointments: 0,
        totalExpenses: 0,
        totalRevenue: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        totalCommission: 0,
        totalTax: 0,
        directCosts: 0,
        overheadCosts: 0,
        operationalCosts: 0,
        netProfit: 0,
        marginPercent: 0,
      },
      byService: [],
      byStaff: [],
    })),
    closeout: vi.fn(async () => ({})),
    listExpenses: vi.fn(async () => []),
    expenseSummary: vi.fn(async () => ({ total: 0, byCategory: [] }) as never),
    createExpense: vi.fn(async () => ({
      id: "expense-1",
      title: "produto",
      amount: 80,
      barbershopId: "shop-1",
    }) as never),
    deleteExpense: vi.fn(async () => undefined),
    listFiados: vi.fn(async () => []),
    fiadoSummary: vi.fn(async () => ({}) as never),
    addFiadoPayment: vi.fn(async () => ({})),
    chargeFiado: vi.fn(async () => ({})),
    commissions: vi.fn(async () => ({ data: [], total: 0 })),
    commissionSummary: vi.fn(async () => ({ grossTotal: 0, commissionTotal: 0, byProfessional: [] })),
    goals: vi.fn(async () => []),
    goalProgress: vi.fn(async () => ({})),
    registerCashMovement: vi.fn(async () => ({})),
    closeCashDay: vi.fn(async () => ({ cashDiscrepancy: 0 })),
    listStaff: vi.fn(async () => []),
    listTimeOff: vi.fn(async () => []),
    updateService: vi.fn(async () => ({} as never)),
    createService: vi.fn(async () => ({} as never)),
    listServicePackages: vi.fn(async () => []),
    listClientPackages: vi.fn(async () => []),
    listVouchers: vi.fn(async () => []),
    reputation: vi.fn(async () => ({ averageRating: 0, totalReviews: 0 })),
    listProducts: vi.fn(async () => []),
    productReports: vi.fn(async () => ({})),
    stockAlerts: vi.fn(async () => []),
    actionLogs: vi.fn(async () => []),
    updatePreferences: vi.fn(async () => undefined),
    subscriptionStatus: vi.fn(async () => ({
      planName: "Pro",
      status: "ACTIVE",
      active: true,
      inTrial: false,
      trialEndsAt: null,
      endDate: null,
      cancelDate: null,
      price: 99,
    })),
    recentReviews: vi.fn(async () => []),
    sendCampaignToClients: vi.fn(async () => ({ sent: 0, failed: 0, skipped: 0 })),
    requestTimeOff: vi.fn(async () => ({})),
    deleteClient: vi.fn(async () => undefined),
    shopStatus: vi.fn(async () => ({})),
    setShopStatus: vi.fn(async () => undefined),
    schedule: vi.fn(async () => []),
    updateSchedule: vi.fn(async () => undefined),
    sendToShopClient: vi.fn(async () => ({ ok: true })),
    scheduleClientNotification: vi.fn(async () => ({ id: "notif-1" })),
    shopInstanceName: vi.fn(async () => "shop-123"),
    shopTimezone: vi.fn(async () => "America/Sao_Paulo"),
    ...overrides,
  } as OwnerBotActions;
}

function makeMessenger() {
  const sent: string[] = [];
  const messenger: OwnerBotMessenger = {
    send: vi.fn(async (_phone: string, text: string) => {
      sent.push(text);
      return true;
    }),
  };
  return { messenger, sent };
}

function buildService(options: {
  repo?: ReturnType<typeof makeRepo>;
  actions?: OwnerBotActions;
  hasAccess?: boolean;
}) {
  const { messenger, sent } = makeMessenger();
  const store = new InMemoryOwnerBotStore();
  const service = new OwnerBotService({
    repo: options.repo as never,
    store,
    messenger,
    actions: options.actions,
    hasAccess: async () => options.hasAccess ?? true,
    now: () => new Date("2026-10-27T12:00:00Z"),
  });
  return { service, sent, store };
}

describe("OwnerBotService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pede o código de vínculo para número não vinculado (uma vez por janela)", async () => {
    const repo = makeRepo({ findActiveLinksByPhone: vi.fn(async () => []) });
    const { service, sent } = buildService({ repo });

    await service.handleIncoming({ messageId: "m1", phone: OTHER_PHONE, text: "olá" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("não está vinculado");

    await service.handleIncoming({ messageId: "m2", phone: OTHER_PHONE, text: "olá de novo" });
    expect(sent).toHaveLength(1);
  });

  it("víncula o número com um código válido e confirma", async () => {
    const code = "AB12CD";
    const repo = makeRepo({
      findActiveLinksByPhone: vi.fn(async () => []),
      findPendingLinkCode: vi.fn(async () => ({
        id: "code-1",
        userId: "user-1",
        barbershopId: "shop-1",
        codeHash: hashOwnerBotLinkCode(code),
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date("2026-10-27T12:05:00Z"),
        createdAt: new Date(),
      })),
    });
    const { service, sent } = buildService({ repo });

    await service.handleIncoming({
      messageId: "m1",
      phone: OWNER_PHONE,
      text: `VINCULAR ${code}`,
    });

    expect(repo.createLink).toHaveBeenCalledWith({
      userId: "user-1",
      barbershopId: "shop-1",
      normalizedPhone: OWNER_PHONE,
    });
    expect(repo.consumeLinkCode).toHaveBeenCalledWith("code-1");
    expect(sent.join(" ")).toContain("Studio Marina");
  });

  it("recusa o código quando o número não é o cadastrado no salão", async () => {
    const code = "AB12CD";
    const repo = makeRepo({
      findActiveLinksByPhone: vi.fn(async () => []),
      findPendingLinkCode: vi.fn(async () => ({
        id: "code-1",
        userId: "user-1",
        barbershopId: "shop-1",
        codeHash: hashOwnerBotLinkCode(code),
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date("2026-10-27T12:05:00Z"),
        createdAt: new Date(),
      })),
    });
    const { service, sent } = buildService({ repo });

    await service.handleIncoming({ messageId: "m1", phone: OTHER_PHONE, text: code });

    expect(repo.createLink).not.toHaveBeenCalled();
    expect(sent.join(" ")).toContain("outro número");
  });

  it("recusa o vínculo quando o plano está sem acesso", async () => {
    const code = "AB12CD";
    const repo = makeRepo({
      findActiveLinksByPhone: vi.fn(async () => []),
      findPendingLinkCode: vi.fn(async () => ({
        id: "code-1",
        userId: "user-1",
        barbershopId: "shop-1",
        codeHash: hashOwnerBotLinkCode(code),
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date("2026-10-27T12:05:00Z"),
        createdAt: new Date(),
      })),
    });
    const { service, sent } = buildService({ repo, hasAccess: false });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: code });

    expect(repo.createLink).not.toHaveBeenCalled();
    expect(sent.join(" ")).toContain("plano");
  });

  it("ignora mensagem repetida (mesmo id da Evolution)", async () => {
    const { service, sent } = buildService({ repo: makeRepo() });

    await service.handleIncoming({ messageId: "dup", phone: OWNER_PHONE, text: "ajuda" });
    await service.handleIncoming({ messageId: "dup", phone: OWNER_PHONE, text: "ajuda" });

    expect(sent).toHaveLength(1);
  });

  it("lista a agenda do dia", async () => {
    const actions = makeActions({
      listAppointments: vi.fn(async () => [
        {
          id: "appt-1",
          barbershopId: "shop-1",
          serviceId: "service-1",
          staffId: null,
          customerName: "Joana",
          whatsapp: OTHER_PHONE,
          date: new Date("2026-10-27T00:00:00Z"),
          time: "10:30",
          status: "CONFIRMED" as const,
          serviceName: "Corte",
          servicePrice: 60,
          staffName: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    });
    const { service, sent } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "agenda" });

    expect(sent.join(" ")).toContain("10:30 — Joana");
  });

  it("agenda um horário depois da confirmação", async () => {
    const actions = makeActions();
    const { service, sent } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "agendar" });
    await service.handleIncoming({ messageId: "m2", phone: OWNER_PHONE, text: "1" });
    await service.handleIncoming({ messageId: "m3", phone: OWNER_PHONE, text: "amanha" });
    await service.handleIncoming({ messageId: "m4", phone: OWNER_PHONE, text: "10:30" });
    await service.handleIncoming({ messageId: "m5", phone: OWNER_PHONE, text: "Joana" });
    await service.handleIncoming({ messageId: "m6", phone: OWNER_PHONE, text: "11988888888" });
    expect(sent.join(" ")).toContain("Confirma?");

    await service.handleIncoming({ messageId: "m7", phone: OWNER_PHONE, text: "1" });

    expect(actions.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: "service-1",
        customerName: "Joana",
        whatsapp: "5511988888888",
        date: "2026-10-28",
        time: "10:30",
      }),
      expect.objectContaining({ barbershopId: "shop-1", role: "OWNER" })
    );
    expect(sent.join(" ")).toContain("Agendado!");
  });

  it("não grava nada quando o dono recusa a confirmação", async () => {
    const actions = makeActions();
    const { service } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "agendar" });
    await service.handleIncoming({ messageId: "m2", phone: OWNER_PHONE, text: "1" });
    await service.handleIncoming({ messageId: "m3", phone: OWNER_PHONE, text: "amanha" });
    await service.handleIncoming({ messageId: "m4", phone: OWNER_PHONE, text: "10:30" });
    await service.handleIncoming({ messageId: "m5", phone: OWNER_PHONE, text: "Joana" });
    await service.handleIncoming({ messageId: "m6", phone: OWNER_PHONE, text: "11988888888" });
    await service.handleIncoming({ messageId: "m7", phone: OWNER_PHONE, text: "2" });

    expect(actions.createAppointment).not.toHaveBeenCalled();
  });

  it("cancela o horário escolhido após a confirmação", async () => {
    const actions = makeActions({
      listAppointments: vi.fn(async () => [
        {
          id: "appt-1",
          barbershopId: "shop-1",
          serviceId: "service-1",
          staffId: null,
          customerName: "Joana",
          whatsapp: OTHER_PHONE,
          date: new Date("2026-10-27T00:00:00Z"),
          time: "10:30",
          status: "CONFIRMED" as const,
          serviceName: "Corte",
          servicePrice: 60,
          staffName: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    });
    const { service, sent } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "cancelar" });
    await service.handleIncoming({ messageId: "m2", phone: OWNER_PHONE, text: "1" });
    await service.handleIncoming({ messageId: "m3", phone: OWNER_PHONE, text: "1" });

    expect(actions.cancelAppointment).toHaveBeenCalledWith(
      "appt-1",
      expect.objectContaining({ barbershopId: "shop-1" })
    );
    expect(sent.join(" ")).toContain("cancelado");
  });

  it("registra a ação executada na auditoria", async () => {
    const repo = makeRepo();
    const { service } = buildService({ repo });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "ajuda" });

    expect(repo.touchLink).toHaveBeenCalledWith("link-1");
  });

  it("comando de escrita pede confirmação antes de lançar despesa", async () => {
    const actions = makeActions();
    const { service, sent } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "gastei 80 de produto" });
    expect(actions.createExpense).not.toHaveBeenCalled();
    expect(sent.join(" ")).toContain("Confirma?");

    await service.handleIncoming({ messageId: "m2", phone: OWNER_PHONE, text: "1" });
    expect(actions.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 80 }),
      expect.objectContaining({ barbershopId: "shop-1" })
    );
    expect(sent.join(" ")).toContain("Despesa lançada");
  });

  it("não lança despesa quando o dono responde 2", async () => {
    const actions = makeActions();
    const { service } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "gastei 80 de produto" });
    await service.handleIncoming({ messageId: "m2", phone: OWNER_PHONE, text: "2" });

    expect(actions.createExpense).not.toHaveBeenCalled();
  });

  it("ação sensível exige CONFIRMAR (não aceita 'sim')", async () => {
    const actions = makeActions();
    const { service, sent } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "fechar o caixa de hoje" });
    expect(sent.join(" ")).toContain("CONFIRMAR");
    expect(actions.closeCashDay).not.toHaveBeenCalled();

    await service.handleIncoming({ messageId: "m2", phone: OWNER_PHONE, text: "sim" });
    expect(actions.closeCashDay).not.toHaveBeenCalled();

    await service.handleIncoming({ messageId: "m3", phone: OWNER_PHONE, text: "CONFIRMAR" });
    expect(actions.closeCashDay).toHaveBeenCalled();
  });

  it("responde bloqueado quando o assistente está bloqueado no salão", async () => {
    const repo = makeRepo({
      getPreferences: vi.fn(async () => ({
        enabled: true,
        blocked: true,
        blockedAt: new Date(),
        briefingEnabled: false,
        briefingTime: "07:30",
        summaryEnabled: false,
        summaryTime: "21:00",
        alertsEnabled: true,
        alertTypes: [],
        tone: "FRIENDLY",
        language: "pt-BR",
      })),
    });
    const { service, sent } = buildService({ repo });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "agenda" });

    expect(sent.join(" ")).toContain("bloqueado");
  });

  it("comando de leitura financeira executa direto", async () => {
    const actions = makeActions();
    const { service, sent } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "faturamento da semana" });

    expect(sent.join(" ")).toContain("R$");
    expect(actions.insights).toHaveBeenCalled();
  });

  it("desfaz a despesa lançada dentro da janela de 2 minutos", async () => {
    const actions = makeActions();
    const { service, sent } = buildService({ repo: makeRepo(), actions });

    await service.handleIncoming({ messageId: "m1", phone: OWNER_PHONE, text: "gastei 80 de produto" });
    await service.handleIncoming({ messageId: "m2", phone: OWNER_PHONE, text: "1" });
    expect(actions.createExpense).toHaveBeenCalled();

    await service.handleIncoming({ messageId: "m3", phone: OWNER_PHONE, text: "desfazer" });
    expect(actions.deleteExpense).toHaveBeenCalledWith(
      "expense-1",
      expect.objectContaining({ barbershopId: "shop-1" })
    );
    expect(sent.join(" ")).toContain("Despesa apagada");
  });

  it("limita ações de escrita por minuto", async () => {
    const actions = makeActions();
    const { service, sent } = buildService({ repo: makeRepo(), actions });

    for (let index = 0; index < 11; index += 1) {
      await service.handleIncoming({
        messageId: `w${index}`,
        phone: OWNER_PHONE,
        text: `gastei ${index + 1} de produto`,
      });
      // "2" recusa a confirmação e limpa o fluxo sem contar nova escrita.
      await service.handleIncoming({
        messageId: `d${index}`,
        phone: OWNER_PHONE,
        text: "2",
      });
    }

    expect(sent.join(" ")).toContain("Muitas ações");
  });
});
