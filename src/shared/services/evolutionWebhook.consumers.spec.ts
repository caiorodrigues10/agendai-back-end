import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Item 8 da rodada de correções: `parseEvolutionWebhook` tem mais de um
 * consumidor. Toda mensagem que chega nele pode ser só-mídia (foto, áudio,
 * documento) — cada consumidor precisa saber o que fazer com isso.
 *
 * Este arquivo lista os consumidores e testa a mensagem só-mídia em cada um.
 */

const mocks = vi.hoisted(() => ({
  enqueueAi: vi.fn(),
  enqueueOwnerBot: vi.fn(),
}));

vi.mock("@/shared/infra/queue/whatsappAiQueue", () => ({
  enqueueWhatsAppAiMessage: mocks.enqueueAi,
}));

vi.mock("@/shared/infra/queue/ownerBotQueue", () => ({
  enqueueOwnerBotMessage: mocks.enqueueOwnerBot,
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

import { WhatsAppAiController } from "@/modules/whatsappAi/whatsappAiController";
import { OwnerBotController } from "@/modules/whatsappOwnerBot/ownerBotController";

/** Payload de mídia sem texto nenhum. */
const PAYLOAD_SO_MIDIA = {
  event: "messages.upsert",
  instance: "agendai-plataforma",
  data: {
    key: { remoteJid: "551199999999@s.whatsapp.net", fromMe: false, id: "MSG-MIDIA" },
    message: {
      documentMessage: {
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName: "clientes.xlsx",
        fileLength: 1024,
      },
    },
  },
};

function request(body: unknown) {
  return {
    headers: { "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET! },
    body,
    ip: "127.0.0.1",
    params: {},
    query: {},
  } as never;
}

function replyCollector() {
  const sent: Array<{ success: boolean; data: unknown }> = [];
  return { sent, reply: { send: (p: unknown) => sent.push(p as never) } as never };
}

/** Lista de arquivos que importam `parseEvolutionWebhook` (fora do próprio serviço). */
function listaConsumidores(): string[] {
  const raiz = join(process.cwd(), "src");
  const encontrados: string[] = [];
  const andar = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) {
        andar(caminho);
        continue;
      }
      if (!caminho.endsWith(".ts") || caminho.endsWith(".spec.ts")) continue;
      const conteudo = readFileSync(caminho, "utf8");
      if (!/parseEvolutionWebhook/.test(conteudo)) continue;
      // o serviço que define a função e a fachada que só reexporta não contam
      if (caminho.endsWith("shared/services/evolutionWebhook.ts")) continue;
      if (caminho.endsWith("whatsappOwnerBot/ownerBotWebhook.ts")) continue;
      encontrados.push(caminho.replace(`${raiz}/`, ""));
    }
  };
  andar(raiz);
  return encontrados.sort();
}

describe("consumidores do parseEvolutionWebhook — mensagem só-mídia", () => {
  const originalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const originalInstance = process.env.EVOLUTION_INSTANCE_NAME;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_WEBHOOK_SECRET = "segredo-de-teste-com-tamanho-suficiente";
    process.env.EVOLUTION_INSTANCE_NAME = "agendai-plataforma";
    mocks.enqueueAi.mockResolvedValue(undefined);
    mocks.enqueueOwnerBot.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.EVOLUTION_WEBHOOK_SECRET;
    else process.env.EVOLUTION_WEBHOOK_SECRET = originalSecret;
    if (originalInstance === undefined) delete process.env.EVOLUTION_INSTANCE_NAME;
    else process.env.EVOLUTION_INSTANCE_NAME = originalInstance;
  });

  it("a lista de consumidores é a do código (toda mudança precisa de teste)", () => {
    expect(listaConsumidores()).toEqual([
      "modules/whatsappAi/whatsappAiController.ts",
      "modules/whatsappOwnerBot/ownerBotController.ts",
    ]);
  });

  it("atendente de IA ignora mensagem só-mídia (não gasta IA)", async () => {
    const controller = new WhatsAppAiController({
      service: { handleIncoming: vi.fn() } as never,
      repo: {} as never,
    });
    const { sent, reply } = replyCollector();

    await controller.handleEvolutionWebhook(request(PAYLOAD_SO_MIDIA), reply);

    expect(mocks.enqueueAi).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].data).toMatchObject({ ignored: "mensagem sem texto" });
  });

  it("assistente do dono enfileira a mensagem só-mídia com a mídia e o remoteJid", async () => {
    const controller = new OwnerBotController();
    const { sent, reply } = replyCollector();

    await controller.handleEvolutionWebhook(request(PAYLOAD_SO_MIDIA), reply);

    expect(mocks.enqueueOwnerBot).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueOwnerBot).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "MSG-MIDIA",
        remoteJid: "551199999999@s.whatsapp.net",
        media: expect.objectContaining({ type: "document", fileName: "clientes.xlsx" }),
      })
    );
    expect(sent).toHaveLength(1);
  });
});
