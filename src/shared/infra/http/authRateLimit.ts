const DEFAULT_AUTH_RATE_LIMIT_MAX = 10;

/**
 * Teto do rate limit de `/auth/login` (e demais rotas de autenticação).
 *
 * O padrão continua 10/min. Só `NODE_ENV=development` ou `NODE_ENV=test`
 * podem afrouxar via `LOGIN_RATE_LIMIT_MAX` (ex.: suíte e2e local loga várias
 * vezes no mesmo minuto). Em produção a env é ignorada — o limite não pode
 * ser enfraquecido de fora.
 */
export function authRateLimitMax(env: NodeJS.ProcessEnv = process.env): number {
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
    return DEFAULT_AUTH_RATE_LIMIT_MAX;
  }

  const raw = Number(env.LOGIN_RATE_LIMIT_MAX);
  if (!Number.isInteger(raw) || raw < 1) return DEFAULT_AUTH_RATE_LIMIT_MAX;

  return raw;
}

export const authRateLimit = {
  config: {
    rateLimit: {
      max: authRateLimitMax(),
      timeWindow: "1 minute",
    },
  },
};
