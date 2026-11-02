import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Item 1 da rodada de correções: o webhook do assistente precisa levar
 * `media` e `remoteJid` até o serviço — tanto pelo caminho enfileirado
 * quanto pelo fallback inline (fila fora do ar).
 */

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  handleIncoming: vi.fn(),
}));

vi.mock("@/shared/infra/queue/ownerBotQueue", () => ({
  enqueueOwnerBotMessage: mocks.enqueue,
}));

vi.mock("./ownerBotService", () => ({
  OwnerBotService: class {
    handleIncoming = mocks.handleIncoming;
  },
}));

vi.mock("@/shared/services/platformWhatsAppSettings", () => ({
  getPlatformWhatsAppSettings: vi
    .fn()
    .mockResolvedValue({ aiGloballyEnabled: true, ownerBotGloballyEnabled: true, outboundPaused: false }),
  invalidatePlatformWhatsAppSettingsCache: vi.fn(),
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

const MEDIA = {
  type: "document" as const,
  mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  fileName: "clientes.xlsx",
  fileLength: 2048,
};

const payloadComMidia = {
  event: "messages.upsert",
  instance: "agendai-plataforma",
  data: {
    key: { remoteJid: "551199999999@s.whatsapp.net", fromMe: false, id: "MSG-MEDIA" },
    message: {
      documentMessage: {
        mimetype: MEDIA.mimetype,
        fileName: MEDIA.fileName,
        fileLength: MEDIA.fileLength,
      },
    },
  },
};

function buildRequest(body: unknown) {
  return {
    headers: { "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET! },
    body,
    ip: "127.0.0.1",
    params: {},
    query: {},
  } as never;
}

describe("webhook do assistente — mídia e remoteJid", () => {
  const originalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const originalInstance = process.env.EVOLUTION_INSTANCE_NAME;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_WEBHOOK_SECRET = "segredo-de-teste-com-tamanho-suficiente";
    process.env.EVOLUTION_INSTANCE_NAME = "agendai-plataforma";
    mocks.enqueue.mockResolvedValue(undefined);
    mocks.handleIncoming.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.EVOLUTION_WEBHOOK_SECRET;
    else process.env.EVOLUTION_WEBHOOK_SECRET = originalSecret;
    if (originalInstance === undefined) delete process.env.EVOLUTION_INSTANCE_NAME;
    else process.env.EVOLUTION_INSTANCE_NAME = originalInstance;
  });

  it("enfileira a mídia com o remoteJid", async () => {
    const controller = new OwnerBotController();

    await controller.handleEvolutionWebhook(
      buildRequest(payloadComMidia),
      { send: () => undefined } as never
    );

    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "MSG-MEDIA",
        phone: "551199999999",
        remoteJid: "551199999999@s.whatsapp.net",
        media: expect.objectContaining({ type: "document", fileName: "clientes.xlsx" }),
      })
    );
  });

  it("processa inline com mídia e remoteJid quando a fila falha", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("redis fora"));
    const controller = new OwnerBotController();

    await controller.handleEvolutionWebhook(
      buildRequest(payloadComMidia),
      { send: () => undefined } as never
    );

    expect(mocks.handleIncoming).toHaveBeenCalledTimes(1);
    expect(mocks.handleIncoming).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "MSG-MEDIA",
        remoteJid: "551199999999@s.whatsapp.net",
        media: expect.objectContaining({ type: "document" }),
      })
    );
  });
});
