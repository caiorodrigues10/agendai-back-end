import { resolveOrgAccessToBarbershop } from "@/shared/utils/organizationAccess";

export type SessionIdentity = {
  /** Salão ativo que o access token deve carregar. */
  barbershopId?: string;
  /** Papel efetivo da sessão (pode ser OWNER para um EMPLOYEE que opera via organização). */
  role: string;
};

type SessionUser = {
  id: string;
  role: string;
  barbershopId?: string | null;
};

/**
 * Papel efetivo de quem opera um salão alheio ao seu.
 *
 * `resolveOrgAccessToBarbershop` devolve FULL para um EMPLOYEE que é OWNER/ADMIN
 * da organização dona do salão, mas `authorize(...)` olha o claim `role` do token
 * e continuaria tratando a sessão como funcionária (bloqueando o dashboard). Como
 * o acesso FULL já cobre todo o salão, o papel efetivo emitido é OWNER.
 * MASTER_ADMIN e OWNER são mantidos; o papel real em `users` nunca é alterado.
 */
function effectiveRole(role: string): string {
  return role === "EMPLOYEE" ? "OWNER" : role;
}

/**
 * Resolve a identidade (salão + papel) que um novo access token deve carregar.
 *
 * Usado pelo /auth/refresh e pelo switch-shop: o salão ativo vem do claim
 * `activeBarbershopId` do refresh token e é revalidado a cada renovação — se o
 * usuário perdeu o acesso FULL (membro removido, salão desanexado), a sessão
 * volta sozinha para o salão original do banco. `users.barbershopId` não muda
 * em nenhum dos caminhos.
 */
export async function resolveActiveSession(
  user: SessionUser,
  activeBarbershopId?: string | null,
): Promise<SessionIdentity> {
  const homeShopId = user.barbershopId ?? undefined;

  if (!activeBarbershopId || activeBarbershopId === homeShopId) {
    return { barbershopId: homeShopId, role: user.role };
  }

  const access = await resolveOrgAccessToBarbershop(user.id, user.role, activeBarbershopId);
  if (access !== "FULL") {
    return { barbershopId: homeShopId, role: user.role };
  }

  return { barbershopId: activeBarbershopId, role: effectiveRole(user.role) };
}
