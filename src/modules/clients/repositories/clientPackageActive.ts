import type { Prisma } from "@prisma/client";

/**
 * Regra única de "pacote ativo" do módulo de clientes.
 *
 * A validade usa **exatamente** o mesmo critério de
 * `src/modules/packages/utils/clientPackageCredits.ts` (linhas 29-40):
 *
 * ```ts
 * const expired =
 *   pkg.status === "EXPIRED" ||
 *   (pkg.expiresAt != null && pkg.expiresAt.getTime() <= Date.now());
 * ```
 *
 * Logo, "não vencido" é `expiresAt == null || expiresAt.getTime() > Date.now()`
 * — comparação estritamente maior (`gt`), com a mesma referência de "agora"
 * (`Date.now()`). Um pacote com `expiresAt` exatamente igual ao instante
 * corrente está vencido, como no consumo de créditos.
 *
 * Além da validade, o pacote ativo precisa ter `status = ACTIVE` e pelo menos
 * uma sessão restante (`remainingSessions > 0`).
 *
 * O `barbershopId` entra no filtro para que um pacote de outro salão (vinculado
 * por engano ao cliente) não conte como ativo do salão em contexto — o mesmo
 * cuidado já aplicado ao filtro de fiados em aberto.
 */

/** Pacote no formato usado para a verificação em memória. */
export interface PackageActiveCandidate {
  status: string;
  remainingSessions: number;
  expiresAt: Date | null;
}

/**
 * `true` quando o pacote está ativo segundo a regra acima
 * (ACTIVE, com sessões restantes e não vencido).
 */
export function isPackageActive(
  pkg: PackageActiveCandidate,
  nowMs: number = Date.now(),
): boolean {
  if (pkg.status !== "ACTIVE") return false;
  if (pkg.remainingSessions <= 0) return false;
  if (pkg.expiresAt != null && pkg.expiresAt.getTime() <= nowMs) return false;
  return true;
}

/**
 * Fragmento de `where` do Prisma com a mesma regra, para uso em
 * `packages: { some/none }` e no `include` da contagem.
 */
export function activePackageWhere(
  barbershopId: string,
  nowMs: number = Date.now(),
): Prisma.ClientPackageWhereInput {
  return {
    barbershopId,
    status: "ACTIVE",
    remainingSessions: { gt: 0 },
    // expiresAt nulo = sem expiração; expiresAt > agora = ainda vigente
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(nowMs) } }],
  };
}
