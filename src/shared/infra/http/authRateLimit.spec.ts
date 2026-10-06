import { describe, it, expect } from "vitest";
import { authRateLimitMax, authRateLimit } from "./authRateLimit";

describe("authRateLimitMax", () => {
  it("mantém 10/min quando a env não está definida", () => {
    expect(authRateLimitMax({ NODE_ENV: "development" })).toBe(10);
    expect(authRateLimitMax({ NODE_ENV: "test" })).toBe(10);
    expect(authRateLimitMax({})).toBe(10);
  });

  it("afrouxa o limite fora de produção quando a env é válida", () => {
    expect(authRateLimitMax({ NODE_ENV: "development", LOGIN_RATE_LIMIT_MAX: "60" })).toBe(60);
    expect(authRateLimitMax({ NODE_ENV: "test", LOGIN_RATE_LIMIT_MAX: "120" })).toBe(120);
  });

  it("ignora a env em produção (rate limit não pode ser enfraquecido)", () => {
    expect(authRateLimitMax({ NODE_ENV: "production", LOGIN_RATE_LIMIT_MAX: "10000" })).toBe(10);
    expect(authRateLimitMax({ NODE_ENV: "staging", LOGIN_RATE_LIMIT_MAX: "10000" })).toBe(10);
    expect(authRateLimitMax({ LOGIN_RATE_LIMIT_MAX: "10000" })).toBe(10);
  });

  it("descarta valores inválidos e mantém o padrão", () => {
    expect(authRateLimitMax({ NODE_ENV: "development", LOGIN_RATE_LIMIT_MAX: "abc" })).toBe(10);
    expect(authRateLimitMax({ NODE_ENV: "development", LOGIN_RATE_LIMIT_MAX: "0" })).toBe(10);
    expect(authRateLimitMax({ NODE_ENV: "development", LOGIN_RATE_LIMIT_MAX: "-5" })).toBe(10);
    expect(authRateLimitMax({ NODE_ENV: "development", LOGIN_RATE_LIMIT_MAX: "12.5" })).toBe(10);
  });

  it("exporta a configuração de rota com a janela de 1 minuto", () => {
    expect(authRateLimit.config.rateLimit.timeWindow).toBe("1 minute");
    expect(authRateLimit.config.rateLimit.max).toBe(authRateLimitMax());
  });
});
