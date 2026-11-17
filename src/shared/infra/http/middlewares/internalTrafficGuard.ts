import { FastifyReply, FastifyRequest } from "fastify";
import { INTERNAL_PERMISSIONS } from "@/modules/admin/internalPermissions";
import { requireInternalPermission } from "./requireInternalPermission";
import { verifyInternalAdmin } from "./verifyInternalAdmin";

/**
 * Guarda de permissão interna para o relatório de tráfego de UM salão.
 *
 * O relatório do painel master (`GET /admin/traffic` e
 * `GET /admin/traffic/export`) exige `internal:traffic:read`. A rota por salão
 * (`GET /barbershops/:id/traffic`) precisa exigir a mesma coisa — sem isso um
 * administrador interno escopado que NÃO vê a tela `/master/traffic` ainda
 * conseguiria ler o tráfego de qualquer salão chamando a rota do salão
 * direto.
 *
 * Regras:
 *  - MASTER_ADMIN: `verifyInternalAdmin` (que carrega `permissions` do banco
 *    em `request.user`) e depois `requireInternalPermission(internal:traffic:read)`
 *    — as mesmas guardas, na mesma ordem, de `admin.routes.ts`;
 *  - qualquer outro papel (OWNER): não faz nada. O acesso do dono é definido
 *    por `assertOwnShop` + `checkSubscription` e não muda.
 */
export async function internalTrafficGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.user?.role !== "MASTER_ADMIN") return;

  await verifyInternalAdmin(request, reply);
  await requireInternalPermission(INTERNAL_PERMISSIONS.TRAFFIC_READ)(request, reply);
}
