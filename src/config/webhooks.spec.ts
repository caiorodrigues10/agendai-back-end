/// <reference types="vitest/globals" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertWebhookConfig, validateWebhookConfig, WEBHOOK_SECRETS } from "./webhooks";

const STRONG_ASAAS = "asaas_webhook_token_com_32_chars_ok";
const STRONG_MP = "mercado_pago_webhook_secret_com_32_chars";
const STRONG_ABACATE = "abacatepay_webhook_secret_com_32_chars_x";

function envFor(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

describe("validação de webhook em produção (S4)", () => {
  it("recusa ALLOW_INSECURE_WEBHOOKS=true mesmo com todos os segredos fortes", () => {
    const env = envFor({
      ALLOW_INSECURE_WEBHOOKS: "true",
      PAYMENT_PROVIDERS_ENABLED: "ASAAS,MERCADOPAGO,ABACATEPAY",
      ASAAS_WEBHOOK_TOKEN: STRONG_ASAAS,
      MERCADOPAGO_WEBHOOK_SECRET: STRONG_MP,
      ABACATEPAY_WEBHOOK_SECRET: STRONG_ABACATE,
    });

    expect(validateWebhookConfig(env)).toEqual([
      expect.stringContaining("ALLOW_INSECURE_WEBHOOKS=true em produção"),
    ]);
  });

  it("recusa segredo ausente quando o provedor está habilitado", () => {
    const env = envFor({
      PAYMENT_PROVIDERS_ENABLED: "ASAAS,MERCADOPAGO,ABACATEPAY",
      ASAAS_WEBHOOK_TOKEN: STRONG_ASAAS,
      MERCADOPAGO_WEBHOOK_SECRET: undefined,
      ABACATEPAY_WEBHOOK_SECRET: STRONG_ABACATE,
    });

    expect(validateWebhookConfig(env)).toEqual([
      expect.stringContaining("MERCADOPAGO_WEBHOOK_SECRET ausente em produção"),
    ]);
  });

  it("recusa segredo curto (<32) mesmo para provedor desabilitado", () => {
    const env = envFor({
      PAYMENT_PROVIDERS_ENABLED: "ASAAS",
      ASAAS_WEBHOOK_TOKEN: STRONG_ASAAS,
      MERCADOPAGO_WEBHOOK_SECRET: "curto-demais",
      ABACATEPAY_WEBHOOK_SECRET: STRONG_ABACATE,
    });

    expect(validateWebhookConfig(env)).toEqual([
      expect.stringContaining("MERCADOPAGO_WEBHOOK_SECRET muito curto"),
    ]);
  });

  it("acumula todas as violações em uma única passada", () => {
    const env = envFor({
      ALLOW_INSECURE_WEBHOOKS: "true",
      PAYMENT_PROVIDERS_ENABLED: "ASAAS,MERCADOPAGO,ABACATEPAY",
      ASAAS_WEBHOOK_TOKEN: "curto",
      MERCADOPAGO_WEBHOOK_SECRET: "curto",
      ABACATEPAY_WEBHOOK_SECRET: "curto",
    });

    const errors = validateWebhookConfig(env);
    expect(errors).toHaveLength(4);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ALLOW_INSECURE_WEBHOOKS"),
        expect.stringContaining("ASAAS_WEBHOOK_TOKEN"),
        expect.stringContaining("MERCADOPAGO_WEBHOOK_SECRET"),
        expect.stringContaining("ABACATEPAY_WEBHOOK_SECRET"),
      ])
    );
  });

  it("aceita segredos fortes para os provedores habilitados", () => {
    const env = envFor({
      PAYMENT_PROVIDERS_ENABLED: "ASAAS,MERCADOPAGO,ABACATEPAY",
      ASAAS_WEBHOOK_TOKEN: STRONG_ASAAS,
      MERCADOPAGO_WEBHOOK_SECRET: STRONG_MP,
      ABACATEPAY_WEBHOOK_SECRET: STRONG_ABACATE,
    });

    expect(validateWebhookConfig(env)).toEqual([]);
  });

  it("não exige segredo de provedor desabilitado", () => {
    const env = envFor({
      PAYMENT_PROVIDERS_ENABLED: "ASAAS",
      ASAAS_WEBHOOK_TOKEN: STRONG_ASAAS,
      MERCADOPAGO_WEBHOOK_SECRET: undefined,
      ABACATEPAY_WEBHOOK_SECRET: undefined,
    });

    expect(validateWebhookConfig(env)).toEqual([]);
  });

  it("fora de produção não há restrição", () => {
    expect(validateWebhookConfig({ NODE_ENV: "development" })).toEqual([]);
    expect(
      validateWebhookConfig({
        NODE_ENV: "development",
        ALLOW_INSECURE_WEBHOOKS: "true",
      })
    ).toEqual([]);
  });

  it("assertWebhookConfig lança com a lista de erros e nunca vaza o valor", () => {
    const secretValor = STRONG_MP;
    const segredoCurto = "segredo-abacate-breve";
    const env = envFor({
      ALLOW_INSECURE_WEBHOOKS: "true",
      PAYMENT_PROVIDERS_ENABLED: "ASAAS",
      ASAAS_WEBHOOK_TOKEN: STRONG_ASAAS,
      MERCADOPAGO_WEBHOOK_SECRET: secretValor,
      ABACATEPAY_WEBHOOK_SECRET: segredoCurto,
    });

    let thrown: Error | undefined;
    try {
      assertWebhookConfig(env);
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toContain("Configuração de webhook insegura em produção");
    expect(thrown?.message).toContain("ALLOW_INSECURE_WEBHOOKS");
    expect(thrown?.message).not.toContain(secretValor);
    expect(thrown?.message).not.toContain(STRONG_ASAAS);
    expect(thrown?.message).not.toContain(segredoCurto);
  });

  it("não lança com a configuração correta nem fora de produção", () => {
    expect(() =>
      assertWebhookConfig(
        envFor({
          PAYMENT_PROVIDERS_ENABLED: "ASAAS",
          ASAAS_WEBHOOK_TOKEN: STRONG_ASAAS,
        })
      )
    ).not.toThrow();
    expect(() => assertWebhookConfig({ NODE_ENV: "test" })).not.toThrow();
  });

  it("mínimo de 32 caracteres para todos os segredos", () => {
    expect(Object.values(WEBHOOK_SECRETS).map((entry) => entry.min)).toEqual([
      32, 32, 32,
    ]);
  });

  it("server.ts dispara a validação no boot", () => {
    const serverSource = readFileSync(
      resolve(__dirname, "../shared/infra/http/server.ts"),
      "utf8"
    );
    expect(serverSource).toMatch(/assertWebhookConfig\(\)/);
  });
});
