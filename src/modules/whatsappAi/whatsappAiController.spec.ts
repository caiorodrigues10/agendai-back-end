import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));

vi.mock("@/shared/infra/queue/whatsappAiQueue", () => ({
  enqueueWhatsAppAiMessage: mocks.enqueue,
}));

import { WhatsAppAiController } from "./whatsappAiController";
import type { WhatsAppAiService } from "./whatsappAiService";
import type { WhatsAppAiRepository } from "./whatsappAiRepository";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SHOP_ID = "22222222-2222-4222-8222-222222222222";

function makeService(overrides: Record<string, unknown> = {}) {
  return {
    processIncomingMessage: vi.fn(async () => ({ conversationId: "conv-1" })),
    listConversations: vi.fn(async () => ({ conversations: [], total: 0 })),
    getConversationDetail: vi.fn(async () => ({ id: "conv-1" })),
    getIntentLogs: vi.fn(async () => ({ logs: [], total: 0 })),
    getIntentStats: vi.fn(async () => ({ total: 0 })),
    transferToHuman: vi.fn(async () => ({ id: "conv-1" })),
    handleIncoming: vi.fn(async () => ({ status: "ignored", reason: "teste" })),
    ...overrides,
  };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getAiSettings: vi.fn(async () => ({
      id: SHOP_ID,
      name: "Studio Marina",
      active: true,
      whatsappAiEnabled: true,
    })),
    setAiEnabled: vi.fn(async (_id: string, enabled: boolean) => ({
      id: SHOP_ID,
      name: "Studio Marina",
      active: true,
      whatsappAiEnabled: enabled,
    })),
    ...overrides,
  };
}

function buildController(service = makeService(), repo = makeRepo()) {
  return new WhatsAppAiController({
    service: service as unknown as WhatsAppAiService,
    repo: repo as unknown as WhatsAppAiRepository,
  });
}

function buildRequest(options: {
  params?: Record<string, string>;
  body?: unknown;
  query?: unknown;
  headers?: Record<string, string>;
  role?: string;
  barbershopId?: string | null;
}) {
  return {
    headers: options.headers ?? {},
    body: options.body,
    query: options.query ?? {},
    ip: "127.0.0.1",
    params: options.params ?? {},
    user: {
      id: "user-1",
      role: options.role ?? "OWNER",
      barbershopId: options.barbershopId === undefined ? SHOP_ID : options.barbershopId,
    },
  } as never;
}

function replyCollector() {
  const sent: Array<{ success: boolean; data: unknown }> = [];
  return { sent, reply: { send: (payload: unknown) => sent.push(payload as never) } as never };
}

describe("atendente de IA — isolamento por salão", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa OWNER de outro salão", async () => {
    const controller = buildController();
    const request = buildRequest({
      params: { barbershopId: OTHER_SHOP_ID },
      role: "OWNER",
      barbershopId: SHOP_ID,
    });

    await expect(
      controller.listConversations(request, replyCollector().reply)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("recusa OWNER sem salão vinculado", async () => {
    const controller = buildController();
    const request = buildRequest({
      params: { barbershopId: SHOP_ID },
      role: "OWNER",
      barbershopId: null,
    });

    await expect(
      controller.listConversations(request, replyCollector().reply)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("MASTER_ADMIN acessa o salão da URL", async () => {
    const service = makeService();
    const controller = buildController(service);
    const request = buildRequest({
      params: { barbershopId: OTHER_SHOP_ID },
      role: "MASTER_ADMIN",
      barbershopId: null,
    });
    const { sent, reply } = replyCollector();

    await controller.listConversations(request, reply);

    expect(service.listConversations).toHaveBeenCalledWith(OTHER_SHOP_ID, expect.anything());
    expect(sent).toHaveLength(1);
  });

  it("processIncoming usa o salão do usuário, não o da URL", async () => {
    const service = makeService();
    const controller = buildController(service);
    const request = buildRequest({
      params: { barbershopId: SHOP_ID },
      body: { phone: "5511999999999", content: "oi" },
    });
    const { sent, reply } = replyCollector();

    await controller.processIncoming(request, reply);

    expect(service.processIncomingMessage).toHaveBeenCalledWith(
      SHOP_ID,
      "5511999999999",
      "oi"
    );
    expect(sent[0].success).toBe(true);
  });

  it("rejeita telefone inválido", async () => {
    const controller = buildController();
    const request = buildRequest({
      params: { barbershopId: SHOP_ID },
      body: { phone: "abc", content: "oi" },
    });

    await expect(
      controller.processIncoming(request, replyCollector().reply)
    ).rejects.toThrow();
  });

  it("rejeita mensagem vazia", async () => {
    const controller = buildController();
    const request = buildRequest({
      params: { barbershopId: SHOP_ID },
      body: { phone: "5511999999999", content: "   " },
    });

    await expect(
      controller.processIncoming(request, replyCollector().reply)
    ).rejects.toThrow();
  });

  it("recusa conversa de outro salão", async () => {
    const service = makeService({
      getConversationDetail: vi.fn(async () => {
        throw new Error("Acesso negado");
      }),
    });
    const controller = buildController(service);
    const request = buildRequest({
      params: { barbershopId: OTHER_SHOP_ID },
      role: "OWNER",
      barbershopId: SHOP_ID,
    });

    await expect(
      controller.getConversationDetail(request, replyCollector().reply)
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("atendente de IA — webhook da Evolution", () => {
  const originalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_WEBHOOK_SECRET = "segredo-de-teste-com-tamanho-suficiente";
    mocks.enqueue.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.EVOLUTION_WEBHOOK_SECRET;
    else process.env.EVOLUTION_WEBHOOK_SECRET = originalSecret;
  });

  const payload = {
    event: "messages.upsert",
    instance: "agendai-ia",
    data: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "MSG1" },
      message: { conversation: "oi" },
    },
  };

  it("recusa quando o segredo não está configurado", async () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    const controller = buildController();

    await expect(
      controller.handleEvolutionWebhook(
        buildRequest({ headers: { "x-webhook-secret": "qualquer" }, body: payload }),
        replyCollector().reply
      )
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("recusa segredo errado", async () => {
    const controller = buildController();

    await expect(
      controller.handleEvolutionWebhook(
        buildRequest({ headers: { "x-webhook-secret": "errado" }, body: payload }),
        replyCollector().reply
      )
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("aceita o segredo certo e enfileira a mensagem", async () => {
    const controller = buildController();
    const { sent, reply } = replyCollector();

    await controller.handleEvolutionWebhook(
      buildRequest({
        headers: { "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET! },
        body: payload,
      }),
      reply
    );

    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "MSG1",
        phone: "5511999999999",
        text: "oi",
        instanceName: "agendai-ia",
      })
    );
    expect(sent).toHaveLength(1);
  });

  it("ignora payload sem mensagem de texto", async () => {
    const controller = buildController();
    const { sent, reply } = replyCollector();

    await controller.handleEvolutionWebhook(
      buildRequest({
        headers: { "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET! },
        body: { ...payload, data: { ...payload.data, message: {} } },
      }),
      reply
    );

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it("processa na hora quando a fila está fora", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("redis fora"));
    const service = makeService();
    const controller = buildController(service);
    const { sent, reply } = replyCollector();

    await controller.handleEvolutionWebhook(
      buildRequest({
        headers: { "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET! },
        body: payload,
      }),
      reply
    );

    expect(service.handleIncoming).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "MSG1" })
    );
    expect(sent).toHaveLength(1);
  });
});

describe("atendente de IA — configuração", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve a configuração do salão", async () => {
    const controller = buildController();
    const { sent, reply } = replyCollector();

    await controller.getSettings(
      buildRequest({ params: { barbershopId: SHOP_ID } }),
      reply
    );

    expect(sent[0].data).toMatchObject({ barbershopId: SHOP_ID, enabled: true });
  });

  it("liga e desliga o atendente", async () => {
    const repo = makeRepo();
    const controller = buildController(makeService(), repo);
    const { sent, reply } = replyCollector();

    await controller.updateSettings(
      buildRequest({ params: { barbershopId: SHOP_ID }, body: { enabled: false } }),
      reply
    );

    expect(repo.setAiEnabled).toHaveBeenCalledWith(SHOP_ID, false);
    expect(sent[0].data).toMatchObject({ enabled: false });
  });

  it("recusa OWNER de outro salão nas configurações", async () => {
    const controller = buildController();
    const request = buildRequest({
      params: { barbershopId: OTHER_SHOP_ID },
      role: "OWNER",
      barbershopId: SHOP_ID,
    });

    await expect(controller.getSettings(request, replyCollector().reply)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
