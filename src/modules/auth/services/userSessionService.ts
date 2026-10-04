import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import auth from "@/config/auth";
import { parseDuration } from "@/shared/utils/authUtils";
import { getModuleLogger } from "@/shared/utils/logger";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";

const log = getModuleLogger("user-sessions");

const REVOKED_FLAG_SECONDS = () => {
  const ttlMs = parseDuration(auth.expiresIn);
  // A flag precisa durar pelo menos a vida do access token mais emitido + folga:
  // depois disso nenhum access token com aquele sid ainda é válido.
  return Math.ceil((ttlMs > 0 ? ttlMs : 15 * 60 * 1000) / 1000) + 60;
};

const revokedFlagKey = (sid: string) => `session:revoked:${sid}`;

/** Contexto do dispositivo que fez o login (ip + user-agent). */
export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

export type SessionCheck = "active" | "revoked" | "unknown";

export interface CreateUserSessionInput extends SessionContext {
  id: string;
  userId: string;
  barbershopId?: string | null;
  refreshTokenId?: string;
  rememberedTokenId?: string;
  expiresAt: Date;
}

export function newSessionId(): string {
  return randomUUID();
}

const BROWSERS: Array<[RegExp, string]> = [
  [/\bedg(?:e|a|ios)?\//i, "Edge"],
  [/\bopr\//i, "Opera"],
  [/\bfirefox\//i, "Firefox"],
  [/\bchrome\//i, "Chrome"],
  [/\bsafari\//i, "Safari"],
  [/\bcurl\//i, "cURL"],
  [/\bwget\//i, "Wget"],
];

const OSES: Array<[RegExp, string]> = [
  [/\bwindows nt\b/i, "Windows"],
  [/\bandroid\b/i, "Android"],
  [/\b(?:iphone|ipad|ipod)\b/i, "iOS"],
  [/\bmac os x\b|macintosh/i, "macOS"],
  [/\blinux\b/i, "Linux"],
];

/** Rótulo legível do dispositivo ("Chrome em macOS"), truncado em 120 chars. */
export function deviceLabelFromUserAgent(userAgent?: string | null): string | null {
  if (!userAgent) return null;
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const os = OSES.find(([re]) => re.test(userAgent))?.[1];
  const label = browser && os ? `${browser} em ${os}` : browser || os || "Dispositivo desconhecido";
  return label.slice(0, 120);
}

export async function createUserSession(input: CreateUserSessionInput): Promise<void> {
  await prisma.userSession.create({
    data: {
      id: input.id,
      userId: input.userId,
      barbershopId: input.barbershopId ?? null,
      refreshTokenId: input.refreshTokenId ?? null,
      rememberedTokenId: input.rememberedTokenId ?? null,
      deviceLabel: deviceLabelFromUserAgent(input.userAgent),
      ipAddress: input.ip?.slice(0, 64) ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      expiresAt: input.expiresAt,
    },
  });
}

/**
 * Checa se a sessão está revogada.
 *
 * 1. Redis (`session:revoked:<sid>`, alimentado na revogação, TTL = vida do
 *    access token): barato e é o caminho feliz.
 * 2. Redis indisponível → fallback ao banco (fonte de verdade `revokedAt`).
 * 3. Banco inacessível → "unknown": o chamador decide a política de falha
 *    (fechada para MASTER_ADMIN, aberta com log para os demais).
 *
 * Janela conhecida: se o Redis cair exatamente no ato da revogação e voltar
 * antes do próximo request, um access token em voo pode passar — no máximo
 * por `auth.expiresIn` (15m), pois o refresh é sempre validado no banco.
 */
export async function checkSessionRevoked(sid: string): Promise<SessionCheck> {
  try {
    const redis = getRedisConnection();
    const flag = await redis.get(revokedFlagKey(sid));
    return flag === "1" ? "revoked" : "active";
  } catch (err) {
    log.error({ err, sid }, "session check: redis indisponível, usando banco");
  }

  try {
    const row = await prisma.userSession.findUnique({
      where: { id: sid },
      select: { revokedAt: true, expiresAt: true },
    });
    if (!row) return "unknown";
    if (row.revokedAt || row.expiresAt.getTime() <= Date.now()) return "revoked";
    return "active";
  } catch (err) {
    log.error({ err, sid }, "session check: banco indisponível");
    return "unknown";
  }
}

/** Grava a flag de revogação no Redis (melhor esforço — o banco já é a fonte). */
export async function setRevokedFlag(sid: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(revokedFlagKey(sid), "1", "EX", REVOKED_FLAG_SECONDS());
  } catch (err) {
    log.error(
      { err, sid },
      "falha ao gravar flag de sessão revogada no redis (access tokens em voo valem até expirar)",
    );
  }
}

const TOUCH_THROTTLE_MS = 60_000;
const TOUCH_CACHE_MAX = 10_000;
const lastTouch = new Map<string, number>();

/** Atualiza `lastSeenAt` no máximo 1x por minuto por sessão (fire-and-forget). */
export function touchSession(sid: string): void {
  const now = Date.now();
  const previous = lastTouch.get(sid);
  if (previous !== undefined && now - previous < TOUCH_THROTTLE_MS) return;
  lastTouch.set(sid, now);
  if (lastTouch.size > TOUCH_CACHE_MAX) lastTouch.clear();

  try {
    void prisma.userSession
      .updateMany({ where: { id: sid, revokedAt: null }, data: { lastSeenAt: new Date(now) } })
      .catch((err: unknown) => log.debug({ err, sid }, "touch session falhou (não crítico)"));
  } catch (err) {
    log.debug({ err, sid }, "touch session indisponível (não crítico)");
  }
}

export interface RevokeableSession {
  id: string;
  refreshTokenId?: string | null;
  rememberedTokenId?: string | null;
}

/**
 * Revoga uma sessão: `revokedAt` no banco, apaga os refresh tokens ligados a
 * ela (sessão + dispositivo lembrado daquele login) e sinaliza no Redis para
 * derrubar o access token no próximo request.
 *
 * `keepRemembered` preserva o token de dispositivo lembrado — usado no logout
 * normal, que continua permitindo "contas salvas" neste navegador.
 */
export async function revokeSessionRow(
  session: RevokeableSession,
  opts: { revokedById?: string; reason: string; keepRemembered?: boolean },
): Promise<void> {
  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      revokedAt: new Date(),
      revokedById: opts.revokedById ?? null,
      revokedReason: opts.reason.slice(0, 500),
    },
  });

  const tokenIds = [
    session.refreshTokenId,
    opts.keepRemembered ? null : session.rememberedTokenId,
  ].filter((id): id is string => Boolean(id));
  if (tokenIds.length > 0) {
    await prisma.refreshToken
      .deleteMany({ where: { id: { in: tokenIds } } })
      .catch((err: unknown) => log.error({ err, sid: session.id }, "falha ao apagar tokens da sessão"));
  }

  await setRevokedFlag(session.id);
}

/** Revoga TODAS as sessões ativas de um usuário (revogação em massa). */
export async function revokeAllSessionsForUser(
  userId: string,
  opts: { revokedById?: string; reason: string },
): Promise<{ sessions: number; tokens: number }> {
  const active = await prisma.userSession.findMany({
    where: { userId, revokedAt: null },
    select: { id: true },
  });

  const updated = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedById: opts.revokedById ?? null,
      revokedReason: opts.reason.slice(0, 500),
    },
  });

  const tokens = await prisma.refreshToken.deleteMany({ where: { userId } });

  for (const row of active) await setRevokedFlag(row.id);

  return { sessions: updated.count, tokens: tokens.count };
}

export type SessionStatus = "active" | "revoked" | "expired";

export function sessionStatus(row: { revokedAt: Date | null; expiresAt: Date }): SessionStatus {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  return "active";
}
