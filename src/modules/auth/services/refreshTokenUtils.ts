import { prisma } from "@/libs/prismaClient";
import type { RefreshTokenPurpose } from "@prisma/client";

/** Duas abas / PWA+browser disparam refresh juntos; o 2º chega com o cookie já rotacionado. */
export const REFRESH_REUSE_GRACE_MS = 15_000;

type RefreshTokenResult = {
  record: { id: string; token: string; userId: string; expiresAt: Date; createdAt: Date; purpose: RefreshTokenPurpose } | null;
  concurrentReuse: boolean;
};

/**
 * Busca um refresh token usável no banco.
 * Fase 1: match exato por token.
 * Fase 2: janela de graça para tokens recentes do mesmo usuário (concurrent reuse).
 *
 * @param refreshToken  O valor bruto do JWT
 * @param userId        ID do usuário (decoded.sub)
 * @param purpose       Filtrar por 'session' ou 'remembered_device' (opcional — se omitido, busca qualquer purpose)
 */
export async function findUsableRefreshToken(
  refreshToken: string,
  userId: string,
  purpose?: RefreshTokenPurpose,
): Promise<RefreshTokenResult> {
  const now = new Date();

  const whereExact: Record<string, unknown> = { token: refreshToken };
  if (purpose) whereExact.purpose = purpose;

  const exact = await prisma.refreshToken.findFirst({ where: whereExact });
  if (exact && exact.expiresAt >= now) {
    return { record: exact, concurrentReuse: false };
  }

  if (exact && exact.expiresAt < now) {
    return { record: null, concurrentReuse: false };
  }

  const whereRecent: Record<string, unknown> = {
    userId,
    createdAt: { gte: new Date(now.getTime() - REFRESH_REUSE_GRACE_MS) },
    expiresAt: { gt: now },
  };
  if (purpose) whereRecent.purpose = purpose;

  const recent = await prisma.refreshToken.findFirst({
    where: whereRecent,
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return { record: recent, concurrentReuse: true };
  }
  return { record: null, concurrentReuse: false };
}
