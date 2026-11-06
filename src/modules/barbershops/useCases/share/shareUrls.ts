import type { FastifyRequest } from "fastify";

/**
 * Regras de URL da página pública de compartilhamento (`GET /s/salon/:id`).
 *
 * - `PUBLIC_APP_URL` (obrigatória em produção): origem pública do **app** —
 *   canonical, `og:url` e destino do `meta refresh`.
 * - `PUBLIC_API_URL` (obrigatória em produção se `/api` não estiver na mesma
 *   origem do app): base do `og:image` quando o salão **não** tem capa.
 *
 * `request.protocol`/`request.hostname` só honram `X-Forwarded-Proto/Host`
 * quando o Fastify sobe com `trustProxy` (env `TRUST_PROXY`); atrás de proxy,
 * sem isso a origem sai `http://` com o host interno e o preview quebra.
 */
export interface ShareUrlEnv {
  PUBLIC_APP_URL?: string;
  PUBLIC_API_URL?: string;
  NODE_ENV?: string;
  PORT?: string;
}

function trimOrigin(raw: string | undefined): string {
  return raw?.trim().replace(/\/+$/, "") ?? "";
}

/** Origem da requisição, honrando o trustProxy do Fastify. */
export function requestOrigin(request: FastifyRequest, env: ShareUrlEnv = process.env): string {
  const host = request.hostname;
  if (host) return `${request.protocol}://${host}`;
  return `http://localhost:${env.PORT ?? 3333}`;
}

/**
 * Origem pública do app (canonical/`og:url`/redirect): `PUBLIC_APP_URL`, ou a
 * própria requisição quando a env não existe (dev/teste).
 */
export function resolvePublicAppUrl(
  request: FastifyRequest,
  env: ShareUrlEnv = process.env,
): string {
  return trimOrigin(env.PUBLIC_APP_URL) || requestOrigin(request, env);
}

/**
 * Base do `og:image` sem capa: `PUBLIC_API_URL`. Sem ela, **só fora de
 * produção** a origem da requisição é usada — em produção o `http://` interno
 * do proxy nunca vira URL de preview. Em produção sem `PUBLIC_API_URL` nem
 * `PUBLIC_APP_URL`, a base fica vazia e o use case **omite** o `og:image`.
 */
export function resolvePublicApiUrl(
  request: FastifyRequest,
  env: ShareUrlEnv = process.env,
): string {
  const explicit = trimOrigin(env.PUBLIC_API_URL);
  if (explicit) return explicit;
  if (env.NODE_ENV !== "production") return requestOrigin(request, env);
  return trimOrigin(env.PUBLIC_APP_URL);
}

/**
 * Avisos de configuração das URLs de compartilhamento (somente produção).
 * Apenas orienta o operador — nunca altera a resolução das URLs.
 */
export function shareEnvProductionWarnings(env: ShareUrlEnv = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];

  const warnings: string[] = [];
  if (!trimOrigin(env.PUBLIC_APP_URL)) {
    warnings.push(
      "PUBLIC_APP_URL ausente em produção: a página /s/salon/:id cai para a origem da requisição em canonical/og:url, o que vira http:// interno atrás de proxy. Configure PUBLIC_APP_URL.",
    );
  }
  if (!trimOrigin(env.PUBLIC_API_URL)) {
    warnings.push(
      "PUBLIC_API_URL ausente em produção: o og:image sem capa sai de PUBLIC_APP_URL (ok só se /api estiver exposto nessa mesma origem); sem nenhuma env o og:image é omitido. Configure PUBLIC_API_URL quando a API tiver origem própria.",
    );
  }
  return warnings;
}
