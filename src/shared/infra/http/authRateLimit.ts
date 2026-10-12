import { createHash } from "node:crypto";
import { verify, Secret } from "jsonwebtoken";
import auth from "@/config/auth";

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

/**
 * Teto do `/auth/refresh` — separado do login e **fixo em todos os ambientes**.
 *
 * O access token vive só em memória no front, então cada carregamento de página
 * renova a sessão: um IP compartilhado (salão, NAT, escritório) teria vários
 * clientes batendo no mesmo balde e cairia em 429 (que o front interpreta como
 * sessão encerrada e desloga). Por isso o refresh tem teto próprio e mais alto,
 * enquanto o login continua em 10/min em produção.
 */
export const REFRESH_RATE_LIMIT_MAX = 120;

/**
 * Chave do balde do refresh: a **sessão**, não o IP.
 *
 * `sid`/`sub` são lidos só do refresh token **com assinatura válida** (mesmo
 * segredo do backend) — token faltando, adulterado ou forjado cai no balde por
 * IP, para que um payload livre não abra balde infinito. Sessões diferentes no
 * mesmo IP (vários funcionários do salão) ficam em balde separado.
 */
export function refreshRateLimitKey(request: {
  ip: string;
  cookies?: Record<string, string | undefined>;
}): string {
  const token = request.cookies?.refresh_token;
  if (token) {
    try {
      const decoded = verify(token, auth.refreshSecret as Secret) as {
        sub?: unknown;
        sid?: unknown;
      };
      const identity =
        typeof decoded.sid === "string" && decoded.sid
          ? decoded.sid
          : typeof decoded.sub === "string" && decoded.sub
            ? decoded.sub
            : null;
      if (identity) {
        return `session:${createHash("sha256").update(identity).digest("hex")}`;
      }
    } catch {
      // Token inválido/falsificado: cai no balde por IP.
    }
  }
  return `ip:${request.ip}`;
}

export const refreshRateLimit = {
  config: {
    rateLimit: {
      max: REFRESH_RATE_LIMIT_MAX,
      timeWindow: "1 minute",
      keyGenerator: refreshRateLimitKey,
    },
  },
};
