import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));

vi.mock("@/shared/infra/queue/ownerBotQueue", () => ({
  enqueueOwnerBotMessage: mocks.enqueue,
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    ownerBotLinkCode: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    ownerBotLink: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    ownerBotActionLog: { create: vi.fn(), findMany: vi.fn() },
    ownerBotPreference: { findUnique: vi.fn(), upsert: vi.fn() },
    barbershop: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { OwnerBotController } from "./ownerBotController";
import { prisma } from "@/libs/prismaClient";

function buildRequest(headers: Record<string, string>, body: unknown) {
  return {
    headers,
    body,
    ip: "127.0.0.1",
    params: {},
    query: {},
  } as never;
}

function buildOwnerRequest(params: Record<string, string>, body: unknown, query = {}) {
  return {
    headers: {},
    body,
    query,
    ip: "127.0.0.1",
    params,
    user: { id: "user-1", role: "OWNER", barbershopId: params.barbershopId },
  } as never;
}

const payload = {
  event: "messages.upsert",
  instance: "agendai-plataforma",
  data: {
    key: { remoteJid: "551199999999@s.whatsapp.net", fromMe: false, id: "MSG1" },
    message: { conversation: "agenda" },
  },
};

describe("webhook da Evolution do assistente do dono", () => {
  const originalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const originalInstance = process.env.EVOLUTION_INSTANCE_NAME;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_WEBHOOK_SECRET = "segredo-de-teste-com-tamanho-suficiente";
    process.env.EVOLUTION_INSTANCE_NAME = "agendai-plataforma";
    mocks.enqueue.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.EVOLUTION_WEBHOOK_SECRET;
    else process.env.EVOLUTION_WEBHOOK_SECRET = originalSecret;
    if (originalInstance === undefined) delete process.env.EVOLUTION_INSTANCE_NAME;
    else process.env.EVOLUTION_INSTANCE_NAME = originalInstance;
  });

  it("recusa quando o segredo não está configurado", async () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    const controller = new OwnerBotController();

    await expect(
      controller.handleEvolutionWebhook(
        buildRequest({ "x-webhook-secret": "qualquer" }, payload),
        {} as never
      )
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("recusa segredo errado", async () => {
    const controller = new OwnerBotController();

    await expect(
      controller.handleEvolutionWebhook(
        buildRequest({ "x-webhook-secret": "errado" }, payload),
        {} as never
      )
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("aceita o segredo certo e enfileira a mensagem", async () => {
    const controller = new OwnerBotController();
    const sent: unknown[] = [];
    const reply = { send: (payload: unknown) => sent.push(payload) } as never;

    await controller.handleEvolutionWebhook(
      buildRequest({ "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET! }, payload),
      reply
    );

    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "MSG1", phone: "551199999999", text: "agenda" })
    );
    expect(sent).toHaveLength(1);
  });

  it("ignora mensagem de outra instância", async () => {
    const controller = new OwnerBotController();
    const sent: unknown[] = [];
    const reply = { send: (payload: unknown) => sent.push(payload) } as never;

    await controller.handleEvolutionWebhook(
      buildRequest(
        { "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET! },
        { ...payload, instance: "shop-123" }
      ),
      reply
    );

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });
});

const SHOP_ID = "11111111-1111-4111-8111-111111111111";

function mockShop(segment = "BARBERSHOP") {
  vi.mocked(prisma.barbershop.findUnique).mockResolvedValue({
    id: SHOP_ID,
    name: "Barbearia Central",
    businessSegment: segment as never,
    whatsapp: "5511999999999",
    active: true,
  } as never);
}

function replyCollector() {
  const sent: Array<{ success: boolean; data: unknown }> = [];
  return { sent, reply: { send: (p: unknown) => sent.push(p as never) } as never };
}

describe("preferências, catálogo e auditoria do assistente", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve as preferências com padrão quando o salão não tem registro", async () => {
    mockShop();
    vi.mocked(prisma.ownerBotPreference.findUnique).mockResolvedValue(null as never);

    const controller = new OwnerBotController();
    const { sent, reply } = replyCollector();

    await controller.getPreferences(
      buildOwnerRequest({ barbershopId: SHOP_ID }, undefined),
      reply
    );

    expect(sent[0].data).toMatchObject({
      enabled: true,
      blocked: false,
      briefingEnabled: false,
      briefingTime: "07:30",
      summaryEnabled: false,
      summaryTime: "21:00",
      alertsEnabled: true,
    });
  });

  it("atualiza preferências via PUT (upsert parcial)", async () => {
    mockShop();
    vi.mocked(prisma.ownerBotPreference.upsert).mockResolvedValue({
      barbershopId: SHOP_ID,
      enabled: true,
      blocked: false,
      briefingEnabled: true,
      briefingTime: "06:45",
      summaryEnabled: false,
      summaryTime: "21:00",
      alertsEnabled: true,
      alertTypes: ["LOW_STOCK"],
      tone: "FRIENDLY",
      language: "pt-BR",
    } as never);
    vi.mocked(prisma.ownerBotPreference.findUnique).mockResolvedValue({
      barbershopId: SHOP_ID,
      enabled: true,
      blocked: false,
      briefingEnabled: true,
      briefingTime: "06:45",
      summaryEnabled: false,
      summaryTime: "21:00",
      alertsEnabled: true,
      alertTypes: ["LOW_STOCK"],
      tone: "FRIENDLY",
      language: "pt-BR",
    } as never);

    const controller = new OwnerBotController();
    const { sent, reply } = replyCollector();

    await controller.updatePreferences(
      buildOwnerRequest(
        { barbershopId: SHOP_ID },
        { briefingEnabled: true, briefingTime: "06:45", alertTypes: ["LOW_STOCK"] }
      ),
      reply
    );

    expect(prisma.ownerBotPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { barbershopId: SHOP_ID },
        update: expect.objectContaining({ briefingEnabled: true, briefingTime: "06:45" }),
      })
    );
    expect(sent[0].data).toMatchObject({ briefingEnabled: true, briefingTime: "06:45" });
  });

  it("rejeita horário fora do formato HH:MM", async () => {
    mockShop();
    const controller = new OwnerBotController();

    await expect(
      controller.updatePreferences(
        buildOwnerRequest({ barbershopId: SHOP_ID }, { briefingTime: "25h00" }),
        replyCollector().reply
      )
    ).rejects.toThrow();
  });

  it("rejeita tipo de alerta desconhecido", async () => {
    mockShop();
    const controller = new OwnerBotController();

    await expect(
      controller.updatePreferences(
        buildOwnerRequest({ barbershopId: SHOP_ID }, { alertTypes: ["NADA_ASSIM"] }),
        replyCollector().reply
      )
    ).rejects.toThrow();
  });

  it("devolve o catálogo de comandos do segmento", async () => {
    mockShop("BARBERSHOP");

    const controller = new OwnerBotController();
    const { sent, reply } = replyCollector();

    await controller.getCatalog(
      buildOwnerRequest({ barbershopId: SHOP_ID }, undefined),
      reply
    );

    const data = sent[0].data as { total: number; categories: Array<{ id: string }> };
    expect(data.total).toBeGreaterThan(0);
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.categories.some((cat) => cat.id === "AGENDA")).toBe(true);
  });

  it("lista auditoria com filtros", async () => {
    mockShop();
    vi.mocked(prisma.ownerBotActionLog.findMany).mockResolvedValue([
      {
        id: "log-1",
        action: "agenda.schedule",
        status: "SUCCESS",
        phoneMasked: "(11) 99999-9999",
        createdAt: new Date("2026-10-27T10:00:00Z"),
        request: {},
        result: null,
        errorMessage: null,
        commandId: "agenda.schedule",
        riskClass: "WRITE",
        affectedIds: ["apt-1"],
        canUndo: false,
        undoneAt: null,
      },
    ] as never);

    const controller = new OwnerBotController();
    const { sent, reply } = replyCollector();

    await controller.listActionLogs(
      buildOwnerRequest(
        { barbershopId: SHOP_ID },
        undefined,
        { limit: "10", riskClass: "WRITE" }
      ),
      reply
    );

    expect(prisma.ownerBotActionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ riskClass: "WRITE" }),
        take: 10,
      })
    );
    expect(sent[0].data).toEqual([
      expect.objectContaining({
        id: "log-1",
        action: "agenda.schedule",
        riskClass: "WRITE",
        status: "SUCCESS",
        canUndo: false,
        createdAt: "2026-10-27T10:00:00.000Z",
      }),
    ]);
  });

  it("recusa limit acima de 100", async () => {
    mockShop();
    const controller = new OwnerBotController();

    await expect(
      controller.listActionLogs(
        buildOwnerRequest({ barbershopId: SHOP_ID }, undefined, { limit: "500" }),
        replyCollector().reply
      )
    ).rejects.toThrow();
  });

  it("recusa acesso de OWNER a salão diferente", async () => {
    mockShop();
    const controller = new OwnerBotController();
    const request = {
      headers: {},
      body: undefined,
      query: {},
      ip: "127.0.0.1",
      params: { barbershopId: "22222222-2222-4222-8222-222222222222" },
      user: { id: "user-1", role: "OWNER", barbershopId: SHOP_ID },
    } as never;

    await expect(
      controller.getCatalog(request, replyCollector().reply)
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
