import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sign } from "jsonwebtoken";
import auth from "@/config/auth";
import {
  authRateLimitMax,
  authRateLimit,
  refreshRateLimit,
  refreshRateLimitKey,
  REFRESH_RATE_LIMIT_MAX,
} from "./authRateLimit";

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

describe("refreshRateLimit", () => {
  it("tem teto próprio, mais alto que o login e fixo (não depende da env)", () => {
    expect(REFRESH_RATE_LIMIT_MAX).toBeGreaterThanOrEqual(60);
    expect(REFRESH_RATE_LIMIT_MAX).toBeLessThanOrEqual(120);
    expect(refreshRateLimit.config.rateLimit.max).toBe(REFRESH_RATE_LIMIT_MAX);
    // O refresh não herda o balde nem o teto do login.
    expect(refreshRateLimit.config.rateLimit.max).toBeGreaterThan(
      authRateLimitMax({ NODE_ENV: "production" }),
    );
    expect(refreshRateLimit.config.rateLimit.timeWindow).toBe("1 minute");
  });

  it("chaveia por sessão quando há refresh token com assinatura válida", () => {
    const keyFor = (sub: string) =>
      refreshRateLimitKey({
        ip: "203.0.113.7",
        cookies: { refresh_token: sign({ sub }, auth.refreshSecret, { expiresIn: "7d" }) },
      });

    const first = keyFor(randomUUID());
    const second = keyFor(randomUUID());
    const sessionSub = randomUUID();

    expect(first).toMatch(/^session:/);
    // Sessões diferentes no mesmo IP (salão/NAT) ficam em balde separado.
    expect(first).not.toBe(second);
    // A mesma sessão mantém o balde entre chamadas.
    expect(keyFor(sessionSub)).toBe(keyFor(sessionSub));
  });

  it("cai no balde por IP sem cookie, com token forjado ou assinatura errada", () => {
    expect(refreshRateLimitKey({ ip: "203.0.113.7" })).toBe("ip:203.0.113.7");
    expect(
      refreshRateLimitKey({ ip: "203.0.113.7", cookies: { refresh_token: "token-adulterado" } }),
    ).toBe("ip:203.0.113.7");
    expect(
      refreshRateLimitKey({
        ip: "203.0.113.7",
        cookies: { refresh_token: sign({ sub: randomUUID() }, "outro-segredo-que-nao-e-o-do-app", { expiresIn: "7d" }) },
      }),
    ).toBe("ip:203.0.113.7");
  });
});
