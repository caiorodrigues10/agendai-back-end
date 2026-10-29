import type { BusinessSegment } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";

/**
 * Cache curto do segmento do estabelecimento.
 *
 * O segmento muda raramente (Configurações), mas o gate de módulo é avaliado
 * em requests de lista (comissões, produtos, estoque). Um cache local de 60s
 * evita uma consulta por request sem estado compartilhado entre processos.
 */

const CACHE_TTL_MS = 60_000;

type CacheEntry = { segment: BusinessSegment | null; expiresAt: number };
const segmentCache = new Map<string, CacheEntry>();

/** Invalida o cache do segmento (chamado quando o dono troca o segmento). */
export function invalidateSegmentCache(barbershopId: string): void {
  segmentCache.delete(barbershopId);
}

/** Segmento do estabelecimento (null quando não existe). */
export async function getBusinessSegment(
  barbershopId: string
): Promise<BusinessSegment | null> {
  const cached = segmentCache.get(barbershopId);
  if (cached && cached.expiresAt > Date.now()) return cached.segment;

  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { businessSegment: true },
  });
  const segment = shop?.businessSegment ?? null;
  segmentCache.set(barbershopId, { segment, expiresAt: Date.now() + CACHE_TTL_MS });
  return segment;
}
