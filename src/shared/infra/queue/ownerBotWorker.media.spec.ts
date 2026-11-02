import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Item 1 da rodada de correções: o job da fila do assistente precisa
 * repassar `media` e `remoteJid` para o serviço — sem isso a mídia chega
 * "nua" (sem download porque não há remoteJid) ou nem chega.
 */

const handleIncoming = vi.fn(async () => undefined);
let capturedProcessor: ((job: any) => Promise<unknown>) | null = null;

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(_name: string, processor: (job: any) => Promise<unknown>) {
      capturedProcessor = processor;
    }
    on() {
      return this;
    }
  },
  Queue: class {},
  QueueEvents: class {},
}));

vi.mock("./redisConnection", () => ({
  getRedisConnection: () => ({}),
}));

vi.mock("@/modules/whatsappOwnerBot/ownerBotService", () => ({
  OwnerBotService: class {
    handleIncoming = handleIncoming;
  },
}));

import { ownerBotWorker } from "./ownerBotWorker";

describe("ownerBotWorker — repasse de media e remoteJid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("repasse media e remoteJid do job para o serviço", async () => {
    // o proxy cria o worker ao acessar uma propriedade
    ownerBotWorker.on("ready", () => undefined);
    expect(capturedProcessor).toBeTruthy();

    await capturedProcessor!({
      id: "job-1",
      data: {
        messageId: "msg-1",
        phone: "551199999999",
        text: "",
        instanceName: "agendai-plataforma",
        remoteJid: "551199999999@s.whatsapp.net",
        media: {
          type: "document",
          mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          fileName: "clientes.xlsx",
          fileLength: 1234,
        },
      },
    });

    expect(handleIncoming).toHaveBeenCalledTimes(1);
    expect(handleIncoming).toHaveBeenCalledWith({
      messageId: "msg-1",
      phone: "551199999999",
      text: "",
      instanceName: "agendai-plataforma",
      remoteJid: "551199999999@s.whatsapp.net",
      media: {
        type: "document",
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName: "clientes.xlsx",
        fileLength: 1234,
      },
    });
  });

  it("não inventa remoteJid nem media quando o job não tem", async () => {
    ownerBotWorker.on("ready", () => undefined);
    expect(capturedProcessor).toBeTruthy();

    await capturedProcessor!({
      id: "job-2",
      data: { messageId: "msg-2", phone: "551199999999", text: "olá" },
    });

    const payload = (handleIncoming.mock.calls[0] as unknown as Record<string, unknown>[])[0];
    expect(payload.remoteJid).toBeUndefined();
    expect(payload.media).toBeUndefined();
  });
});
