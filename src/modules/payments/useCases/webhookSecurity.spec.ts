import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { ProcessWebhookController } from "./processWebhook/ProcessWebhookController";
import { ProcessAbacateWebhookController } from "./processAbacateWebhook/ProcessAbacateWebhookController";
import { ProcessAsaasWebhookController } from "./processAsaasWebhook/ProcessAsaasWebhookController";

function replyCapture() {
  const state: { statusCode?: number; body?: unknown } = {};
  const reply = {
    status: (statusCode: number) => {
      state.statusCode = statusCode;
      return reply;
    },
    send: (body: unknown) => {
      state.body = body;
      return reply;
    },
  };
  return { reply, state };
}

function request(headers: Record<string, string | undefined>, body: unknown) {
  return {
    headers,
    body,
    query: {},
    log: { error: () => undefined, warn: () => undefined },
  } as any;
}

describe("webhook security boundary (mock-only)", () => {
  const environment = {
    NODE_ENV: process.env.NODE_ENV,
    MERCADOPAGO_WEBHOOK_SECRET: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    ABACATEPAY_WEBHOOK_SECRET: process.env.ABACATEPAY_WEBHOOK_SECRET,
    ASAAS_WEBHOOK_TOKEN: process.env.ASAAS_WEBHOOK_TOKEN,
    ALLOW_INSECURE_WEBHOOKS: process.env.ALLOW_INSECURE_WEBHOOKS,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("rejects a Mercado Pago request without a valid HMAC", async () => {
    process.env.NODE_ENV = "production";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "local-only-webhook-secret";
    const { reply, state } = replyCapture();

    await new ProcessWebhookController().handle(
      request({ "x-signature": "ts=1,v1=not-a-valid-signature" }, { type: "payment", data: { id: "123" } }),
      reply as any
    );

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ message: "Assinatura inválida" });
  });

  it("acknowledges malformed but correctly signed Mercado Pago payloads without processing", async () => {
    process.env.NODE_ENV = "production";
    const secret = "local-only-webhook-secret";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = secret;
    const manifest = "id:;request-id:local-request;ts:1;";
    const signature = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const { reply, state } = replyCapture();

    await new ProcessWebhookController().handle(
      request(
        { "x-signature": `ts=1,v1=${signature}`, "x-request-id": "local-request" },
        { unsupported: true }
      ),
      reply as any
    );

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ received: true });
  });

  it("rejects AbacatePay requests when the local secret is absent", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOW_INSECURE_WEBHOOKS;
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
    const { reply, state } = replyCapture();

    await new ProcessAbacateWebhookController().handle(request({}, {}) as any, reply as any);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ message: "Secret inválido" });
  });

  it("rejects Asaas requests when the provider token is absent", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOW_INSECURE_WEBHOOKS;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    const { reply, state } = replyCapture();

    await new ProcessAsaasWebhookController().handle(request({}, {}) as any, reply as any);

    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ message: "Token inválido" });
  });
});
