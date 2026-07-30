import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
  isWhatsAppGatewayConfigured,
} from "./whatsappNotificationService";

describe("normalizeWhatsAppPhone", () => {
  it("prefixa 55 para números BR com DDD", () => {
    expect(normalizeWhatsAppPhone("(11) 98888-7777")).toBe("5511988887777");
    expect(normalizeWhatsAppPhone("11988887777")).toBe("5511988887777");
  });

  it("não duplica 55 se já vier com DDI", () => {
    expect(normalizeWhatsAppPhone("5511988887777")).toBe("5511988887777");
  });
});

describe("sendWhatsAppMessage (Evolution API)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "http://localhost:8080";
    process.env.EVOLUTION_API_KEY = "evo-key-1";
    process.env.EVOLUTION_INSTANCE_NAME = "barberqueue";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
    delete process.env.EVOLUTION_INSTANCE_NAME;
    vi.restoreAllMocks();
  });

  it("isWhatsAppGatewayConfigured reflete o env", () => {
    expect(isWhatsAppGatewayConfigured()).toBe(true);
    delete process.env.EVOLUTION_API_KEY;
    expect(isWhatsAppGatewayConfigured()).toBe(false);
  });

  it("POST em sendText com apikey e body number/text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    globalThis.fetch = fetchMock as any;

    const sent = await sendWhatsAppMessage("11988887777", "Olá");
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/message/sendText/barberqueue");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("evo-key-1");
    expect(JSON.parse(init.body)).toEqual({
      number: "5511988887777",
      text: "Olá",
    });
  });

  it("remove barra final da URL base", async () => {
    process.env.EVOLUTION_API_URL = "http://localhost:8080/";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    globalThis.fetch = fetchMock as any;

    await sendWhatsAppMessage("11988887777", "Oi");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8080/message/sendText/barberqueue"
    );
  });

  it("retorna false se Evolution API não estiver configurada", async () => {
    delete process.env.EVOLUTION_API_URL;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
    const sent = await sendWhatsAppMessage("11988887777", "Olá");
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retorna false quando a API responde com erro HTTP", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });
    globalThis.fetch = fetchMock as any;
    const sent = await sendWhatsAppMessage("11988887777", "Olá");
    expect(sent).toBe(false);
  });

  it("usa instanceName da opção quando informado (não cai no fallback do env)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    globalThis.fetch = fetchMock as any;

    const sent = await sendWhatsAppMessage("11988887777", "Olá", {
      instanceName: "barbearia-do-zeca",
    });
    expect(sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://localhost:8080/message/sendText/barbearia-do-zeca"
    );
    expect(init.headers.apikey).toBe("evo-key-1");
  });

  it("sem instanceName na opção, cai no fallback do env EVOLUTION_INSTANCE_NAME", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    globalThis.fetch = fetchMock as any;

    // Passa opções sem instanceName — função deve usar env.
    const sent = await sendWhatsAppMessage("11988887777", "Olá", {});
    expect(sent).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/message/sendText/barberqueue");
  });

  it("instanceName vazio na opção também cai no fallback do env", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    globalThis.fetch = fetchMock as any;

    const sent = await sendWhatsAppMessage("11988887777", "Olá", {
      instanceName: "   ",
    });
    expect(sent).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/message/sendText/barberqueue");
  });

  it("aceita log como segundo argumento posicional (compatibilidade legada)", async () => {
    // Compat: callers antigos passam o logger do Fastify como 3º parâmetro posicional.
    // A função deve normalizar para { log } e continuar funcionando com fallback de env.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    globalThis.fetch = fetchMock as any;
    const legacyLog = { info: vi.fn(), warn: vi.fn() };

    const sent = await sendWhatsAppMessage(
      "11988887777",
      "Olá",
      legacyLog as any
    );
    expect(sent).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8080/message/sendText/barberqueue"
    );
  });
});
