import { z } from "zod";
import { MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH } from "@/shared/constants/money";
import {
  paginationQuerySchema as basePaginationQuerySchema,
  booleanQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/shared/utils/pagination";

export const createServiceSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  barbershopId: z.string().uuid(),
  name: z.string().min(2).max(100),
  price: z.number().min(0).max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH),
  avgTimeMinutes: z.number().min(1),
  icon: z.string().min(1).max(50),
  commissionPercent: z.number().min(0).max(100).optional(),
  /**
   * Serviço agendável pelo cliente (padrão true). Quando false, o serviço é
   * interno — audiência, diligência, despacho — e não aparece na agenda pública.
   */
  publicBookable: z.boolean().optional()
});

export const updateServiceSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(100).optional(),
  price: z.number().min(0).max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH).optional(),
  avgTimeMinutes: z.number().min(1).optional(),
  icon: z.string().min(1).max(50).optional(),
  active: z.boolean().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  publicBookable: z.boolean().optional()
});

/**
 * Campos que a listagem de serviços aceita ordenar.
 *
 * A whitelist é fechada: qualquer outro campo devolve 400.
 */
export const SERVICE_SORT_FIELDS = ["nome", "preco", "duracao", "criado"] as const;

/**
 * Query da listagem de serviços (`GET /api/services`).
 *
 * - `page`/`limit`: paginação (default e máximo 100 — quem não manda
 *   `page`/`limit` continua recebendo o catálogo inteiro, como antes).
 * - `search`: busca pelo nome; termo vazio vira "sem filtro".
 * - `categoryId`: filtra por categoria.
 * - `active`: `true`/`false`. **Opcional de propósito**: sem ele, serviço
 *   inativo continua aparecendo (comportamento atual).
 * - `sort`: `<campo>:<asc|desc>`, campo na whitelist acima.
 *
 * O `barbershopId` NÃO é campo do schema: ele é lido da query crua pelo
 * controller (a rota é pública — a página de agendamento consulta o catálogo
 * pelo salão) e nunca é aceito como filtro de salão.
 */
export const listServicesQuerySchema = basePaginationQuerySchema({
  defaultLimit: 100,
  maxLimit: 100,
}).extend({
  search: searchTermSchema({ max: 100 }),
  categoryId: z.string().uuid().optional(),
  active: booleanQuerySchema.optional(),
  sort: sortSchema(SERVICE_SORT_FIELDS),
});

export type ListServicesQueryDTO = z.infer<typeof listServicesQuerySchema>;
