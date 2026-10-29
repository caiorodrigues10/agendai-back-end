import { describe, expect, it, vi } from "vitest";
import { OwnerBotPushService } from "./ownerBotPush";
import type { OwnerBotActions } from "./ownerBotActions";
import type { OwnerBotMessenger } from "./ownerBotMessenger";
import type { BusinessSegment } from "@prisma/client";

const SHOP = "shop-1";
const OWNER = "551199999999";

function prefRow(overrides: Record<string, unknown> = {}) {
  return {
    barbershopId: SHOP,
    briefingEnabled: true,
    briefingTime: "07:30",
    summaryEnabled: false,
    summaryTime: "21:00",
    alertsEnabled: true,
    alertTypes: [],
    tone: "FRIENDLY",
    lastBriefingAt: null,
    lastSummaryAt: null,
    ...overrides,
  };
}

function makeRepo(prefs: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    listEnabledPreferences: vi.fn(async () => prefs),
    findActiveOwnerPhonesByShop: vi.fn(async () => [OWNER]),
    markPushSent: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeMessenger() {
  const sent: Array<{ phone: string; text: string }> = [];
  const messenger: OwnerBotMessenger = {
    send: vi.fn(async (phone: string, text: string) => {
      sent.push({ phone, text });
      return true;
    }),
  };
  return { messenger, sent };
}

function makeActions(overrides: Partial<OwnerBotActions> = {}): OwnerBotActions {
  return {
    listAppointments: vi.fn(async () => [
      {
        id: "appt-1",
        customerName: "Joana",
        serviceName: "Corte",
        time: "10:30",
        status: "CONFIRMED",
        barbershopId: SHOP,
        serviceId: "service-1",
        staffId: null,
        whatsapp: "5511888888888",
        date: new Date("2026-10-28T00:00:00Z"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
    dayFigures: vi.fn(async () => ({
      cashReceived: 100,
      pixReceived: 50,
      cardReceived: 30,
      fiadoCreated: 0,
      fiadoPaid: 0,
      expenses: 20,
      commissions: 10,
      productSales: 0,
    })),
    ...overrides,
  } as OwnerBotActions;
}

// 10:30 UTC ≈ 07:30 em America/Sao_Paulo (UTC-3).
const AT_BRIEFING_TIME = new Date("2026-10-27T10:30:00Z");
const AT_SUMMARY_TIME = new Date("2026-10-28T00:00:00Z"); // 21:00 SP no dia anterior

function buildService(options: {
  prefs?: unknown[];
  actions?: OwnerBotActions;
  now?: Date;
  hasAccess?: boolean;
  segment?: BusinessSegment | null;
}) {
  const { messenger, sent } = makeMessenger();
  const repo = makeRepo(options.prefs ?? [prefRow()]);
  const actions = options.actions ?? makeActions();
  const service = new OwnerBotPushService({
    repo: repo as never,
    messenger,
    actions,
    hasAccess: vi.fn(async () => options.hasAccess ?? true),
    now: () => options.now ?? AT_BRIEFING_TIME,
    getTimezone: vi.fn(async () => "America/Sao_Paulo"),
    getSegment: vi.fn(async () => options.segment ?? null),
  });
  return { service, sent, repo, actions, messenger };
}

describe("OwnerBotPushService", () => {
  it("envia briefing quando a hora bate e grava lastBriefingAt", async () => {
    const { service, sent, repo } = buildService({});

    const report = await service.runDuePushes();

    expect(report.briefing).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].phone).toBe(OWNER);
    expect(sent[0].text).toContain("Hoje você tem 1 atendimento");
    expect(sent[0].text).toContain("Joana");
    expect(repo.markPushSent).toHaveBeenCalledWith(
      SHOP,
      "briefing",
      expect.any(Date)
    );
  });

  it("não envia briefing de novo no mesmo dia", async () => {
    const { service, sent } = buildService({
      prefs: [prefRow({ lastBriefingAt: AT_BRIEFING_TIME })],
    });

    const report = await service.runDuePushes();

    expect(report.briefing).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("não envia briefing quando a hora não bate", async () => {
    const { service, sent } = buildService({
      now: new Date("2026-10-27T12:00:00Z"), // ~09:00 SP
    });

    const report = await service.runDuePushes();

    expect(report.briefing).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("envia resumo de noite com os números do dia", async () => {
    const { service, sent } = buildService({
      prefs: [prefRow({ briefingEnabled: false, summaryEnabled: true })],
      now: AT_SUMMARY_TIME,
    });

    const report = await service.runDuePushes();

    expect(report.summary).toBe(1);
    expect(sent[0].text).toContain("Resumo do dia");
    expect(sent[0].text).toContain("R$");
  });

  it("pula salão sem acesso à assinatura", async () => {
    const { service, sent } = buildService({ hasAccess: false });

    const report = await service.runDuePushes();

    expect(report.skipped).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it("agenda livre manda convite de agendar", async () => {
    const actions = makeActions({ listAppointments: vi.fn(async () => []) });
    const { service, sent } = buildService({ actions });

    await service.runDuePushes();

    expect(sent[0].text).toContain("Agenda livre");
  });

  it("briefing do escritório conta audiências no vocabulário do segmento", async () => {
    const actions = makeActions({
      listAppointments: vi.fn(async () => [
        {
          id: "appt-1",
          customerName: "Joana",
          serviceName: "Audiência preliminar",
          time: "10:30",
          status: "CONFIRMED",
          barbershopId: SHOP,
          serviceId: "service-1",
          staffId: null,
          whatsapp: "5511888888888",
          date: new Date("2026-10-28T00:00:00Z"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "appt-2",
          customerName: "Pedro",
          serviceName: "Consulta inicial",
          time: "14:00",
          status: "CONFIRMED",
          barbershopId: SHOP,
          serviceId: "service-2",
          staffId: null,
          whatsapp: "5511877777777",
          date: new Date("2026-10-28T00:00:00Z"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]) as never,
    });
    const { service, sent } = buildService({ actions, segment: "LAW_FIRM" });

    await service.runDuePushes();

    expect(sent[0].text).toContain("Hoje você tem 2 atendimentos e 1 audiência");
  });

  it("resumo do escritório usa honorários e não fala de comissão", async () => {
    const { service, sent } = buildService({
      prefs: [prefRow({ briefingEnabled: false, summaryEnabled: true })],
      now: AT_SUMMARY_TIME,
      segment: "LAW_FIRM",
    });

    await service.runDuePushes();

    expect(sent[0].text).toContain("Honorários");
    expect(sent[0].text).not.toContain("Comissões");
  });
});
