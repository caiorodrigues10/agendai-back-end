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

describe("sendWhatsAppMessage (Z-API)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.ZAPI_INSTANCE_ID = "inst-1";
    process.env.ZAPI_INSTANCE_TOKEN = "tok-1";
    process.env.ZAPI_CLIENT_TOKEN = "client-1";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.ZAPI_INSTANCE_ID;
    delete process.env.ZAPI_INSTANCE_TOKEN;
    delete process.env.ZAPI_CLIENT_TOKEN;
    vi.restoreAllMocks();
  });

  it("isWhatsAppGatewayConfigured reflete o env", () => {
    expect(isWhatsAppGatewayConfigured()).toBe(true);
    delete process.env.ZAPI_CLIENT_TOKEN;
    expect(isWhatsAppGatewayConfigured()).toBe(false);
  });

  it("POST em send-text com Client-Token e body phone/message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "{}",
    });
    globalThis.fetch = fetchMock as any;

    const sent = await sendWhatsAppMessage("11988887777", "Olá");
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.z-api.io/instances/inst-1/token/tok-1/send-text"
    );
    expect(init.method).toBe("POST");
    expect(init.headers["Client-Token"]).toBe("client-1");
    expect(JSON.parse(init.body)).toEqual({
      phone: "5511988887777",
      message: "Olá",
    });
  });

  it("retorna false se Z-API não estiver configurada", async () => {
    delete process.env.ZAPI_INSTANCE_ID;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
    const sent = await sendWhatsAppMessage("11988887777", "Olá");
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
