import { z } from "zod";
import { isValidDate } from "@/shared/utils/dateUtils";

/**
 * Limite absoluto de página para evitar varreduras ilimitadas no banco.
 */
export const MAX_PAGE = 10_000;

/**
 * Resultado da meta de paginação, padronizada em todos os módulos.
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Fábrica do schema de query de paginação por módulo.
 *
 * Cada módulo mantém seu `defaultLimit` e `maxLimit` atuais para não alterar
 * o comportamento visível (ex.: Products default 30/max 100, admin WhatsApp
 * max 50). `page` é sempre default 1 e máximo 10.000.
 */
export function paginationQuerySchema(opts: {
  defaultLimit?: number;
  maxLimit?: number;
} = {}) {
  const { defaultLimit = 20, maxLimit = 100 } = opts;

  return z.object({
    page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
  });
}

export type PaginationQueryInput = z.infer<
  ReturnType<typeof paginationQuerySchema>
>;

/**
 * Converte (page, limit) em (skip, take) para o Prisma.
 */
export function toSkipTake(page: number, limit: number) {
  return {
    skip: (Math.max(1, page) - 1) * Math.max(1, limit),
    take: Math.max(1, limit),
  };
}

/**
 * Constrói o objeto `meta` padronizado. `totalPages` nunca é menor que 1.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  return {
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  };
}

/**
 * Schema de termo de busca: trim, máximo configurável e vazio → `undefined`.
 *
 * Busca vazia (ou só com espaços) **não é erro**: vira `undefined`, ou seja,
 * "sem filtro". Isso importa porque campos de busca da interface enviam o
 * texto cru do usuário e um `search="   "` derrubaria a listagem com 400.
 *
 * O máximo default é 100 caracteres; módulos com busca mais generosa
 * passam o limite próprio (ex.: Clientes mantém 300, aprovado na Fase 1 —
 * busca longa não pode derrubar a listagem inteira com 400).
 */
export function searchTermSchema(opts: { max?: number } = {}) {
  const { max = 100 } = opts;

  return z
    .string()
    .trim()
    .max(max, `O termo de busca deve ter no máximo ${max} caracteres`)
    .transform((v) => (v.length > 0 ? v : undefined))
    .optional();
}

/**
 * Schema de data civil isolada (YYYY-MM-DD).
 *
 * Valida o formato e a existência do dia no calendário (rejeita "2026-13-01"
 * e "2026-02-30").
 */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD")
  .refine((v) => isValidDate(v), { message: "Data inválida" });

/**
 * Schema de flag booleana em query string: aceita "true"/"false".
 *
 * `z.coerce.boolean()` não serve aqui: `Boolean("false")` é `true`, então
 * "false" viraria verdadeiro.
 */
export const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

/**
 * Schema de intervalo de datas: `from`/`to` no formato YYYY-MM-DD,
 * validando que `from` não seja depois de `to`.
 */
export const dateRangeSchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((v) => !(v.from > v.to), {
    message: "`from` não pode ser depois de `to`",
    path: ["from"],
  });

/**
 * Schema de ordenação por whitelist de campos. Direção aceita `asc`/`desc`.
 *
 * Exemplo de uso na rota:
 *   const sort = sortSchema(["name", "createdAt", "status"]).parse(request.query.sort);
 *   // => { field: "name", dir: "asc" } | undefined
 */
export function sortSchema(allowedFields: readonly string[]) {
  return z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (!val) return undefined;

      const [field, dir = "asc"] = val.split(":") as [string, string?];
      if (!allowedFields.includes(field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Campo de ordenação inválido: ${field}`,
          path: ["sort"],
        });
        return z.NEVER;
      }
      if (dir !== "asc" && dir !== "desc") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Direção de ordenação inválida: ${dir}`,
          path: ["sort"],
        });
        return z.NEVER;
      }
      return { field, dir: dir as "asc" | "desc" };
    });
}

export type SortInput = { field: string; dir: "asc" | "desc" } | undefined;
