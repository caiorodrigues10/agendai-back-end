import { z } from "zod";
import {
  paginationQuerySchema as basePaginationQuerySchema,
  booleanQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/shared/utils/pagination";
import { TEAM_SORT_FIELDS } from "@/modules/users/schemas/userSchemas";

/**
 * Papéis que o **admin da plataforma** pode filtrar na equipe interna.
 *
 * Diferença em relação ao dono (`GET /api/users`), cujo filtro de papel é
 * apenas `OWNER`/`EMPLOYEE` (os papéis que formam a equipe do salão): o admin
 * enxerga a plataforma inteira, então pode filtrar também por `MASTER_ADMIN`
 * (equipe interna) e pelos donos/funcionários dos salões.
 *
 * `CUSTOMER` fica **fora** da whitelist: é um papel reservado, sem uso hoje
 * (o comentário do `enum Role` no `prisma/schema.prisma` diz o mesmo) e a tela
 * do master não filtra por papel — o filtro existindo, só produziria lista
 * vazia.
 */
export const ADMIN_TEAM_ROLE_FIELDS = [
  "MASTER_ADMIN",
  "OWNER",
  "EMPLOYEE",
] as const;

/**
 * Query da listagem da equipe interna (`GET /api/admin/team`).
 *
 * - `page`/`limit`: paginação — **default 25** (o chamador que não manda
 *   `page`/`limit` continua recebendo as 25 primeiras posições, como antes da
 *   migração para o helper de listagem) e máximo 100 (o diálogo de tarefa do
 *   front pede `limit=100`).
 * - `search`: busca por nome ou e-mail; termo vazio vira "sem filtro".
 * - `status`: `active` (ativo e **não removido**) ou `inactive` (desativado
 *   **ou** removido). Sem `status`, o membro removido fica de fora.
 * - `active`: `true`/`false` — situação do membro.
 * - `role`: papel do membro, na whitelist da plataforma acima (`MASTER_ADMIN`,
 *   `OWNER`, `EMPLOYEE`). **Sem `role`, o escopo é a equipe interna**
 *   (`MASTER_ADMIN`).
 * - `sort`: `<campo>:<asc|desc>`, campo na whitelist compartilhada com a
 *   listagem do dono (`nome`, `email`, `cargo`, `criado`).
 */
export const adminTeamQuerySchema = basePaginationQuerySchema({
  defaultLimit: 25,
  maxLimit: 100,
}).extend({
  search: searchTermSchema({ max: 100 }),
  status: z.enum(["active", "inactive"]).optional(),
  active: booleanQuerySchema.optional(),
  role: z.enum(ADMIN_TEAM_ROLE_FIELDS).optional(),
  sort: sortSchema(TEAM_SORT_FIELDS),
});

export type AdminTeamQueryDTO = z.infer<typeof adminTeamQuerySchema>;
