import type { FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";

declare module "fastify" {
  interface FastifyContextConfig {
    /** `false` isenta a rota do guard central de tenant (ver assertTenantParam). */
    tenantParamGuard?: boolean;
  }
}

/**
 * Guard central de tenant: toda rota com `:barbershopId` precisa bater com o
 * salão ativo da sessão.
 *
 * Antes cada controller resolvia por conta própria (`user.barbershopId ??
 * params.barbershopId`) — com a sessão sem salão o parâmetro da URL era usado
 * como estava (leitura cruzada de tenant) e rotas como `cash/*` não tinham
 * nenhum check de ownership (só o closeout tinha).
 *
 * Regras:
 *  - sem `:barbershopId` na rota → não faz nada;
 *  - sem usuário (rota pública) → não faz nada;
 *  - `MASTER_ADMIN` opera qualquer salão;
 *  - rota marcada com `config: { tenantParamGuard: false }` fica isenta
 *    (autorização resolvida pelo próprio controller, ex.: detach de salão em
 *    uma organização);
 *  - o resto precisa ter `user.barbershopId === params.barbershopId`, senão 403.
 */
export function assertTenantParam(request: FastifyRequest): void {
  const params = request.params as { barbershopId?: string } | undefined;
  const paramShopId = params?.barbershopId;
  if (!paramShopId) return;

  const user = request.user;
  if (!user || user.role === "MASTER_ADMIN") return;

  if (request.routeOptions?.config?.tenantParamGuard === false) return;

  if (user.barbershopId !== paramShopId) {
    throw new AppError("Acesso negado", 403);
  }
}
