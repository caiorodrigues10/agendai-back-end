import { AppError } from "@/shared/errors/AppError";

/**
 * Escopo de salão para endpoints de LISTAGEM.
 *
 * Este helper existe para garantir uma regra única: o `barbershopId` da query
 * só é respeitado pelo MASTER_ADMIN. Qualquer outro papel (OWNER, EMPLOYEE,
 * CUSTOMER) resolve sempre pelo salão da sessão — um `barbershopId` de outro
 * salão na query é ignorado.
 *
 * Não use este helper em create/update/delete: nesses casos o salão vem do
 * `body` (MASTER_ADMIN) ou da sessão, conforme a regra de cada módulo.
 *
 * O acesso cross-salão do DONO DE ORGANIZAÇÃO não passa por aqui: ele é
 * resolvido por `resolveOrgAccessToBarbershop` + `withShopContext`
 * (src/shared/utils/organizationAccess.ts e withShopContext.ts), que abrem o
 * contexto RLS do salão-alvo explicitamente.
 */
export interface BarbershopScopedUser {
  role: string;
  barbershopId?: string | null;
}

/**
 * Resolve o barbershopId de uma listagem.
 *
 * Semântica (idêntica à que existia em cada controller antes do helper):
 * - MASTER_ADMIN: usa o `barbershopId` da query; sem ele, 400.
 * - Demais papéis: usa o `barbershopId` da sessão; sem ele, 400.
 *
 * @throws AppError 400 quando não há barbershopId resolvido.
 */
export function resolveBarbershopId(
  user: BarbershopScopedUser,
  queryBarbershopId?: string | null,
): string {
  const resolved =
    user.role === "MASTER_ADMIN"
      ? queryBarbershopId ?? null
      : user.barbershopId ?? null;

  if (!resolved) {
    throw new AppError("barbershopId é obrigatório", 400);
  }
  return resolved;
}
