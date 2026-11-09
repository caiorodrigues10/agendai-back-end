import { z } from "zod";
import {
  dateOnlySchema,
  paginationQuerySchema as basePaginationQuerySchema,
  sortSchema,
} from "@/shared/utils/pagination";

/**
 * Campos de ordenação aceitos na listagem de comissões.
 *
 * - `data` → coluna `createdAt` (data/hora da comissão);
 * - `valor` → coluna `amount` (valor da comissão).
 */
export const COMMISSION_SORT_FIELDS = ["data", "valor"] as const;

/**
 * Query da listagem de comissões.
 *
 * - `from`/`to` filtram **`createdAt`** (a coluna é `DateTime`, timestamp, não
 *   `@db.Date`) em dias civis `YYYY-MM-DD` com limites do **dia civil do
 *   salão** (`civilDayBounds` com o fuso do salão): `from` inclusivo a partir
 *   da meia-noite local e `to` exclusivo na meia-noite local do dia seguinte —
 *   assim o último dia do intervalo entra inteiro.
 * - `professionalId` e `serviceId` são uuid e filtram por igualdade. Vindos de
 *   outro salão, combinados com o `barbershopId` do contexto, devolvem lista
 *   vazia (nunca vazam dados de outro salão).
 * - `origin` continua existindo (`QUEUE` = comissão de fila,
 *   `APPOINTMENT` = comissão de agenda).
 * - Não existe filtro de status: a comissão não tem status.
 * - `sort` aceita apenas `data` e `valor` com `:asc`/`:desc`.
 */
export const listCommissionsQuerySchema = basePaginationQuerySchema({
  defaultLimit: 20,
  maxLimit: 100,
})
  .extend({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    professionalId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    origin: z.enum(["QUEUE", "APPOINTMENT"]).optional(),
    sort: sortSchema(COMMISSION_SORT_FIELDS),
  })
  .refine((v) => !(v.from && v.to && v.from > v.to), {
    message: "`from` não pode ser depois de `to`",
    path: ["from"],
  });
