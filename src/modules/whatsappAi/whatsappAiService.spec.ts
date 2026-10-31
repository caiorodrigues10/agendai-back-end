import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { WhatsAppAiService } from "./whatsappAiService";
import { InMemoryWhatsAppAiStore } from "./whatsappAiStore";
import type { WhatsAppAiMessenger } from "./whatsappAiMessenger";
import type { WhatsAppAiRepository } from "./whatsappAiRepository";
import type { AiSalonContext } from "./whatsappAi.types";

const AI_INSTANCE = "agendai-ia";
const PLATFORM_INSTANCE = "agendai-plataforma";
const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SHOP_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_PHONE = "5511999999999";

const salonContext: AiSalonContext = {
  id: SHOP_ID,
  name: "Studio Marina",
  whatsapp: "55118888888888",
  address: "Rua das Flores, 120",
  city: "São Paulo",
  latitude: null,
  longitude: null,
  timezone: "America/Sao_Paulo",
  businessSegment: "HAIR_SALON",
  openingMode: "SCHEDULE",
  manualStatus: "AUTO",
  schedules: [{ dayOfWeek: 1, isOpen: true, openTime: "09:00", closeTime: "18:00" }],
  services: [{ name: "Corte de cabelo", price: 60, avgTimeMinutes: 40 }],
};

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getAiSettings: vi.fn(async () => ({
      id: SHOP_ID,
      name: "Studio Marina",
      active: true,
      whatsappAiEnabled: true,
    })),
    getSalonContext: vi.fn(async () => salonContext),
    resolveSalonsByPhone: vi.fn(async () => [
      { id: SHOP_ID, name: "Studio Marina", source: "client_link" },
    ]),
    findOrCreateConversation: vi.fn(async () => ({ id: "conv-1", barbershopId: SHOP_ID })),
    createMessage: vi.fn(async (data: Record<string, unknown>) => ({
      id: "msg-1",
      ...data,
    })),
    updateConversationLastMessage: vi.fn(async () => undefined),
    createIntentLog: vi.fn(async () => ({ id: "log-1" })),
    transferToHuman: vi.fn(async () => ({ id: "conv-1", status: "TRANSFERRED_TO_HUMAN" })),
    listByBarbershop: vi.fn(async () => ({ conversations: [], total: 0, page: 1, limit: 20 })),
    findById: vi.fn(async () => ({ id: "conv-1", barbershopId: SHOP_ID, status: "ACTIVE" })),
    getMessages: vi.fn(async () => []),
    getIntentLogs: vi.fn(async () => ({ logs: [], total: 0, page: 1, limit: 20 })),
    getIntentStats: vi.fn(async () => ({
      total: 0,
      byIntent: {},
      byHandledBy: {},
      avgConfidence: 0,
    })),
    ...overrides,
  };
}

function makeMessenger() {
  const sent: Array<{ phone: string; text: string; instanceName?: string }> = [];
  const messenger: WhatsAppAiMessenger = {
    send: vi.fn(async (phone: string, text: string, instanceName?: string) => {
      sent.push({ phone, text, instanceName });
      return true;
    }),
  };
  return { messenger, sent };
}

function buildService(repo: ReturnType<typeof makeRepo>, messenger: WhatsAppAiMessenger) {
  return new WhatsAppAiService({
    repo: repo as unknown as WhatsAppAiRepository,
    store: new InMemoryWhatsAppAiStore(),
    messenger,
    hasAccess: async () => true,
    now: () => new Date("2026-10-27T12:00:00Z"),
  });
}

describe("atendente de IA — entrada em tempo real", () => {
  const originalAiInstance = process.env.EVOLUTION_AI_INSTANCE_NAME;
  const originalPlatformInstance = process.env.EVOLUTION_INSTANCE_NAME;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_AI_INSTANCE_NAME = AI_INSTANCE;
    process.env.EVOLUTION_INSTANCE_NAME = PLATFORM_INSTANCE;
  });

  afterEach(() => {
    if (originalAiInstance === undefined) delete process.env.EVOLUTION_AI_INSTANCE_NAME;
    else process.env.EVOLUTION_AI_INSTANCE_NAME = originalAiInstance;
    if (originalPlatformInstance === undefined) delete process.env.EVOLUTION_INSTANCE_NAME;
    else process.env.EVOLUTION_INSTANCE_NAME = originalPlatformInstance;
  });

  it("resolve o salão pelo número do cliente e responde", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "qual o endereço?",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("answered");
    expect(repo.resolveSalonsByPhone).toHaveBeenCalledWith(CLIENT_PHONE);
    expect(repo.getSalonContext).toHaveBeenCalledWith(SHOP_ID);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Rua das Flores, 120");
    expect(sent[0].instanceName).toBe(AI_INSTANCE);
  });

  it("ignora mensagem da instância da plataforma (assistente do dono)", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "qual o endereço?",
      instanceName: PLATFORM_INSTANCE,
    });

    expect(outcome).toEqual({ status: "ignored", reason: expect.stringContaining("plataforma") });
    expect(repo.resolveSalonsByPhone).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("não processa a mesma mensagem duas vezes", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const message = {
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: AI_INSTANCE,
    };

    await service.handleIncoming(message);
    const second = await service.handleIncoming(message);

    expect(second.status).toBe("ignored");
    expect(sent).toHaveLength(1);
  });

  it("pergunta em qual unidade quando o cliente é de mais de um salão", async () => {
    const repo = makeRepo({
      resolveSalonsByPhone: vi.fn(async () => [
        { id: SHOP_ID, name: "Studio Marina", source: "client_link" },
        { id: OTHER_SHOP_ID, name: "Studio Center", source: "client_crm" },
      ]),
    });
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("clarify_shop");
    expect(sent[0].text).toContain("1. Studio Marina");
    expect(sent[0].text).toContain("2. Studio Center");
    expect(repo.getSalonContext).not.toHaveBeenCalled();
  });

  it("usa a unidade escolhida pelo cliente", async () => {
    const repo = makeRepo({
      resolveSalonsByPhone: vi.fn(async () => [
        { id: SHOP_ID, name: "Studio Marina", source: "client_link" },
        { id: OTHER_SHOP_ID, name: "Studio Center", source: "client_crm" },
      ]),
      getSalonContext: vi.fn(async (id: string) =>
        id === SHOP_ID ? salonContext : { ...salonContext, id: OTHER_SHOP_ID, name: "Studio Center" }
      ),
      getAiSettings: vi.fn(async (id: string) => ({
        id,
        name: id === SHOP_ID ? "Studio Marina" : "Studio Center",
        active: true,
        whatsappAiEnabled: true,
      })),
    });
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: AI_INSTANCE,
    });
    const outcome = await service.handleIncoming({
      messageId: "MSG2",
      phone: CLIENT_PHONE,
      text: "2",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("shop_selected");
    expect(repo.getSalonContext).toHaveBeenCalledWith(OTHER_SHOP_ID);
    expect(sent[1].text).toContain("Studio Center");
  });

  it("repete a lista quando a escolha é inválida", async () => {
    const repo = makeRepo({
      resolveSalonsByPhone: vi.fn(async () => [
        { id: SHOP_ID, name: "Studio Marina", source: "client_link" },
        { id: OTHER_SHOP_ID, name: "Studio Center", source: "client_crm" },
      ]),
    });
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: AI_INSTANCE,
    });
    const outcome = await service.handleIncoming({
      messageId: "MSG2",
      phone: CLIENT_PHONE,
      text: "9",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("clarify_shop");
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain("1. Studio Marina");
  });

  it("ignora cliente sem salão vinculado", async () => {
    const repo = makeRepo({ resolveSalonsByPhone: vi.fn(async () => []) });
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: AI_INSTANCE,
    });

    expect(outcome).toEqual({
      status: "ignored",
      reason: "cliente sem salão vinculado",
    });
    expect(sent).toHaveLength(0);
  });

  it("ignora quando o salão está com a IA desativada", async () => {
    const repo = makeRepo({
      getAiSettings: vi.fn(async () => ({
        id: SHOP_ID,
        name: "Studio Marina",
        active: true,
        whatsappAiEnabled: false,
      })),
    });
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("ignored");
    expect(sent).toHaveLength(0);
  });

  it("ignora quando o salão não tem acesso (sem assinatura)", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = new WhatsAppAiService({
      repo: repo as unknown as WhatsAppAiRepository,
      store: new InMemoryWhatsAppAiStore(),
      messenger,
      hasAccess: async () => false,
    });

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("ignored");
    expect(sent).toHaveLength(0);
  });

  it("atende na instância do próprio salão, sem depender do vínculo do cliente", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: `shop-${SHOP_ID}`,
    });

    expect(outcome.status).toBe("answered");
    expect(repo.resolveSalonsByPhone).not.toHaveBeenCalled();
    expect(repo.getSalonContext).toHaveBeenCalledWith(SHOP_ID);
    expect(sent[0].instanceName).toBe(`shop-${SHOP_ID}`);
  });

  it("ignora instância de salão com id inválido", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "oi",
      instanceName: "shop-nao-e-uuid",
    });

    expect(outcome.status).toBe("ignored");
    expect(sent).toHaveLength(0);
  });

  it(" transfere para humano quando o cliente pede atendente", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "quero falar com um atendente",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("answered");
    expect(repo.transferToHuman).toHaveBeenCalledWith("conv-1");
    expect(sent[0].text).toContain("atendente");
  });

  it("grava mensagem de entrada, resposta e log de intenção", async () => {
    const repo = makeRepo();
    const { messenger } = makeMessenger();
    const service = buildService(repo, messenger);

    await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "quanto custa o corte?",
      instanceName: AI_INSTANCE,
    });

    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "INBOUND", content: "quanto custa o corte?" })
    );
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "OUTBOUND", intent: "pricing" })
    );
    expect(repo.createIntentLog).toHaveBeenCalledWith(
      expect.objectContaining({ barbershopId: SHOP_ID, intent: "pricing" })
    );
  });

  it("respeita o limite de respostas por minuto", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    for (let index = 0; index < 11; index++) {
      await service.handleIncoming({
        messageId: `MSG${index}`,
        phone: CLIENT_PHONE,
        text: "oi",
        instanceName: AI_INSTANCE,
      });
    }

    expect(sent).toHaveLength(10);
  });

  it("ignora número curto demais (formato de grupo)", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: "123456",
      text: "oi",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("ignored");
    expect(sent).toHaveLength(0);
  });

  it("ignora mensagem sem texto", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const outcome = await service.handleIncoming({
      messageId: "MSG1",
      phone: CLIENT_PHONE,
      text: "   ",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("ignored");
    expect(sent).toHaveLength(0);
  });
});

describe("atendente de IA — painel/API", () => {
  it("processa a mensagem e devolve a resposta sem enviar ao WhatsApp", async () => {
    const repo = makeRepo();
    const { messenger, sent } = makeMessenger();
    const service = buildService(repo, messenger);

    const result = await service.processIncomingMessage(SHOP_ID, CLIENT_PHONE, "qual o preço?");

    expect(result.intent).toBe("pricing");
    expect(result.reply).toContain("Corte de cabelo");
    expect(result.conversationId).toBe("conv-1");
    expect(sent).toHaveLength(0);
  });

  it("rejeita conversa de outro salão", async () => {
    const repo = makeRepo({
      findById: vi.fn(async () => ({ id: "conv-1", barbershopId: OTHER_SHOP_ID, status: "ACTIVE" })),
    });
    const { messenger } = makeMessenger();
    const service = buildService(repo, messenger);

    await expect(service.getConversationDetail("conv-1", SHOP_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejeita conversa já finalizada", async () => {
    const repo = makeRepo({
      findById: vi.fn(async () => ({
        id: "conv-1",
        barbershopId: SHOP_ID,
        status: "CLOSED",
      })),
    });
    const { messenger } = makeMessenger();
    const service = buildService(repo, messenger);

    await expect(service.transferToHuman("conv-1", SHOP_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
