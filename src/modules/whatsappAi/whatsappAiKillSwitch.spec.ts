import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
}));

vi.mock("@/shared/services/platformWhatsAppSettings", () => ({
  getPlatformWhatsAppSettings: vi.fn(),
}));

vi.mock("@/shared/infra/queue/whatsappAiQueue", () => ({
  enqueueWhatsAppAiMessage: mocks.enqueue,
}));

import { WhatsAppAiController } from "./whatsappAiController";
import { getPlatformWhatsAppSettings } from "@/shared/services/platformWhatsAppSettings";

const SECRET = "segredo-de-teste-com-tamanho-suficiente";

const payload = {
  event: "messages.upsert",
  instance: "ai",
  data: {
    key: { remoteJid: "551199999999@s.whatsapp.net", fromMe: false, id: "MSG1" },
    message: { conversation: "oi" },
  },
};

function settings(overrides: Record<string, unknown> = {}) {
  return {
    aiGloballyEnabled: true,
    ownerBotGloballyEnabled: true,
    outboundPaused: false,
    reason: null,
    updatedBy: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function replyCollector() {
  const sent: Array<{ success: boolean; data: Record<string, unknown> }> = [];
  return { sent, reply: { send: (p: unknown) => sent.push(p as never) } as never };
}

function buildRequest(headers: Record<string, string>, body: unknown) {
  return { headers, body, ip: "127.0.0.1", params: {}, query: {} } as never;
}

function controller() {
  return new WhatsAppAiController({ service: {} as never, repo: {} as never });
}

describe("kill switch IA", () => {
  const originalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_WEBHOOK_SECRET = SECRET;
    mocks.enqueue.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.EVOLUTION_WEBHOOK_SECRET;
    else process.env.EVOLUTION_WEBHOOK_SECRET = originalSecret;
  });

  it("não enfileira quando globalmente desligado e responde ignored", async () => {
    vi.mocked(getPlatformWhatsAppSettings).mockResolvedValue(settings({ aiGloballyEnabled: false }));
    const { sent, reply } = replyCollector();

    await controller().handleEvolutionWebhook(
      buildRequest({ "x-webhook-secret": SECRET }, payload),
      reply
    );

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].data).toEqual({ ignored: "atendente de IA desligado globalmente" });
  });

  it("controle positivo: ligado enfileira a mensagem", async () => {
    vi.mocked(getPlatformWhatsAppSettings).mockResolvedValue(settings());
    const { sent, reply } = replyCollector();

    await controller().handleEvolutionWebhook(
      buildRequest({ "x-webhook-secret": SECRET }, payload),
      reply
    );

    expect(mocks.enqueue).toHaveBeenCalledWith({
      messageId: "MSG1",
      phone: "551199999999",
      text: "oi",
      instanceName: "ai",
    });
    expect(sent[0].data).toEqual({ queued: true });
  });

  it("evento ignorado pelo parser não enfileira e devolve o motivo", async () => {
    vi.mocked(getPlatformWhatsAppSettings).mockResolvedValue(settings());
    const { sent, reply } = replyCollector();
    const fromMe = {
      ...payload,
      data: { ...payload.data, key: { ...payload.data.key, fromMe: true } },
    };

    await controller().handleEvolutionWebhook(
      buildRequest({ "x-webhook-secret": SECRET }, fromMe),
      reply
    );

    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(sent[0].data).toEqual({ ignored: "mensagem enviada pela plataforma" });
  });

  it("recusa segredo errado sem enfileirar", async () => {
    vi.mocked(getPlatformWhatsAppSettings).mockResolvedValue(settings());

    await expect(
      controller().handleEvolutionWebhook(
        buildRequest({ "x-webhook-secret": "segredo-errado" }, payload),
        replyCollector().reply
      )
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
