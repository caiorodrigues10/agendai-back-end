import { describe, expect, it } from "vitest";
import {
  isPlatformInstance,
  parseEvolutionWebhook,
  verifyWebhookSecret,
} from "./ownerBotWebhook";

describe("parseEvolutionWebhook", () => {
  it("lê uma mensagem de texto recebida", () => {
    const event = parseEvolutionWebhook({
      event: "messages.upsert",
      instance: "agendai-plataforma",
      data: {
        key: { remoteJid: "551199999999@s.whatsapp.net", fromMe: false, id: "MSG123" },
        message: { conversation: "olá" },
      },
    });

    expect(event).toEqual({
      type: "INBOUND_MESSAGE",
      messageId: "MSG123",
      phone: "551199999999",
      text: "olá",
      instanceName: "agendai-plataforma",
    });
  });

  it("lê texto estendido e legenda de mídia", () => {
    expect(
      parseEvolutionWebhook({
        data: {
          key: { remoteJid: "551199999999@s.whatsapp.net", id: "1" },
          message: { extendedTextMessage: { text: "agendar" } },
        },
      })
    ).toMatchObject({ type: "INBOUND_MESSAGE", text: "agendar" });

    expect(
      parseEvolutionWebhook({
        data: {
          key: { remoteJid: "551199999999@s.whatsapp.net", id: "2" },
          message: { imageMessage: { caption: "cancelar" } },
        },
      })
    ).toMatchObject({ type: "INBOUND_MESSAGE", text: "cancelar" });
  });

  it("ignora o que não é mensagem recebida", () => {
    expect(
      parseEvolutionWebhook({
        data: { key: { remoteJid: "551199999999@s.whatsapp.net", fromMe: true, id: "3" } },
      })
    ).toMatchObject({ type: "IGNORED" });

    expect(parseEvolutionWebhook({ event: "connection.update" })).toMatchObject({
      type: "IGNORED",
    });

    expect(
      parseEvolutionWebhook({
        data: { key: { remoteJid: "551199999999@s.whatsapp.net", id: "4" } },
      })
    ).toMatchObject({ type: "IGNORED" });
  });
});

describe("verifyWebhookSecret", () => {
  it("aceita o segredo certo e recusa o errado", () => {
    expect(verifyWebhookSecret("segredo", "segredo")).toBe(true);
    expect(verifyWebhookSecret("segredo", "outro")).toBe(false);
    expect(verifyWebhookSecret(undefined, "segredo")).toBe(false);
    expect(verifyWebhookSecret("segredo", undefined)).toBe(false);
  });
});

describe("isPlatformInstance", () => {
  it("só aceita a instância da plataforma", () => {
    const original = process.env.EVOLUTION_INSTANCE_NAME;
    process.env.EVOLUTION_INSTANCE_NAME = "agendai-plataforma";
    expect(isPlatformInstance("agendai-plataforma")).toBe(true);
    expect(isPlatformInstance("shop-123")).toBe(false);
    if (original === undefined) delete process.env.EVOLUTION_INSTANCE_NAME;
    else process.env.EVOLUTION_INSTANCE_NAME = original;
  });
});
