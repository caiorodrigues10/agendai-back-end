import { describe, expect, it } from "vitest";
import { parseEvolutionWebhook, verifyWebhookSecret } from "./evolutionWebhook";

describe("parseEvolutionWebhook (compartilhado)", () => {
  it("lê uma mensagem de texto recebida", () => {
    const event = parseEvolutionWebhook({
      event: "messages.upsert",
      instance: "agendai-ia",
      data: {
        key: { remoteJid: "551199999999@s.whatsapp.net", fromMe: false, id: "MSG123" },
        message: { conversation: "oi" },
      },
    });

    expect(event).toEqual({
      type: "INBOUND_MESSAGE",
      messageId: "MSG123",
      phone: "551199999999",
      text: "oi",
      instanceName: "agendai-ia",
    });
  });

  it("ignora mensagem enviada pela própria plataforma", () => {
    expect(
      parseEvolutionWebhook({
        data: {
          key: { remoteJid: "551199999999@s.whatsapp.net", fromMe: true, id: "1" },
          message: { conversation: "oi" },
        },
      })
    ).toMatchObject({ type: "IGNORED", reason: expect.stringContaining("plataforma") });
  });

  it("ignora mensagem de grupo e de difusão", () => {
    expect(
      parseEvolutionWebhook({
        data: {
          key: { remoteJid: "120363000000000000@g.us", fromMe: false, id: "2" },
          message: { conversation: "oi" },
        },
      })
    ).toMatchObject({ type: "IGNORED", reason: expect.stringContaining("grupo") });

    expect(
      parseEvolutionWebhook({
        data: {
          key: { remoteJid: "status@broadcast", fromMe: false, id: "3" },
          message: { conversation: "oi" },
        },
      })
    ).toMatchObject({ type: "IGNORED", reason: expect.stringContaining("grupo") });
  });

  it("ignora payload inválido ou sem mensagem", () => {
    expect(parseEvolutionWebhook(null)).toMatchObject({ type: "IGNORED" });
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

describe("verifyWebhookSecret (compartilhado)", () => {
  it("aceita o segredo certo e recusa o errado", () => {
    expect(verifyWebhookSecret("segredo", "segredo")).toBe(true);
    expect(verifyWebhookSecret("segredo", "outro")).toBe(false);
    expect(verifyWebhookSecret(undefined, "segredo")).toBe(false);
    expect(verifyWebhookSecret("segredo", undefined)).toBe(false);
  });
});
