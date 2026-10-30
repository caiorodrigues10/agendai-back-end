/**
 * Buscas compartilhadas pelos processadores de importação.
 *
 * A planilha traz **nomes**; o banco guarda **ids**. Estas funções traduzem
 * um nome da planilha no registro do salão — e, quando o nome é ambíguo,
 * dizem isso com clareza em vez de escolher por conta própria.
 */
import type { AppTx } from "@/libs/prismaClient";
import { normalizeHeaderText } from "../utils/columnMapping";

export type LookupResult<T> =
  | { status: "FOUND"; value: T }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS"; count: number };

/**
 * Profissional da equipe por nome.
 *
 * Casamento exato (ignorando caixa e acentos) primeiro; depois, nome que é
 * prefixo de um único profissional da equipe. Com mais de um candidato, o
 * lote não escolhe: quem importa decide no painel.
 */
export async function lookupStaff(
  tx: AppTx,
  barbershopId: string,
  rawName: string,
): Promise<LookupResult<{ id: string; name: string }>> {
  const name = rawName.trim();
  if (!name) return { status: "NOT_FOUND" };

  const exact = await tx.user.findMany({
    where: {
      barbershopId,
      active: true,
      deletedAt: null,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true, name: true },
    take: 2,
  });
  if (exact.length === 1) return { status: "FOUND", value: exact[0] };
  if (exact.length > 1) return { status: "AMBIGUOUS", count: exact.length };

  const key = normalizeHeaderText(name);
  const candidates = await tx.user.findMany({
    where: { barbershopId, active: true, deletedAt: null },
    select: { id: true, name: true },
  });
  const matches = candidates.filter((candidate) => {
    const candidateKey = normalizeHeaderText(candidate.name);
    return candidateKey === key || candidateKey.startsWith(`${key} `) || key.startsWith(`${candidateKey} `);
  });

  if (matches.length === 1) return { status: "FOUND", value: matches[0] };
  if (matches.length > 1) return { status: "AMBIGUOUS", count: matches.length };
  return { status: "NOT_FOUND" };
}

/** Serviço do catálogo por nome (ignora caixa e acentos). */
export async function lookupService(
  tx: AppTx,
  barbershopId: string,
  rawName: string,
): Promise<LookupResult<{ id: string; name: string }>> {
  const name = rawName.trim();
  if (!name) return { status: "NOT_FOUND" };

  const matches = await tx.service.findMany({
    where: {
      barbershopId,
      active: true,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true, name: true },
    take: 2,
  });
  if (matches.length === 1) return { status: "FOUND", value: matches[0] };
  if (matches.length > 1) return { status: "AMBIGUOUS", count: matches.length };
  return { status: "NOT_FOUND" };
}

/**
 * Pacote do catálogo por nome.
 *
 * O nome identifica o pacote; o serviço é o desambiguador quando há mais de
 * um pacote com o mesmo nome (ex.: "Pacote 5" para serviços diferentes).
 */
export async function lookupServicePackage(
  tx: AppTx,
  barbershopId: string,
  rawName: string,
  rawServiceName?: string,
): Promise<LookupResult<{ id: string; name: string; serviceId: string }>> {
  const name = rawName.trim();
  if (!name) return { status: "NOT_FOUND" };

  const serviceName = rawServiceName?.trim();
  const packages = await tx.servicePackage.findMany({
    where: {
      barbershopId,
      active: true,
      name: { equals: name, mode: "insensitive" },
      ...(serviceName
        ? { service: { name: { equals: serviceName, mode: "insensitive" } } }
        : {}),
    },
    select: { id: true, name: true, serviceId: true },
    take: 2,
  });
  if (packages.length === 1) return { status: "FOUND", value: packages[0] };
  if (packages.length > 1) return { status: "AMBIGUOUS", count: packages.length };
  return { status: "NOT_FOUND" };
}

/** Cliente do CRM pelo WhatsApp normalizado. */
export async function lookupClientByPhone(
  tx: AppTx,
  barbershopId: string,
  normalizedPhone: string,
): Promise<{ id: string; name: string } | null> {
  return tx.salonClient.findFirst({
    where: { barbershopId, normalizedWhatsapp: normalizedPhone },
    select: { id: true, name: true },
  });
}
