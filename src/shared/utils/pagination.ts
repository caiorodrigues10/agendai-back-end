import { z } from "zod";

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
 * Schema de termo de busca: trim, mínimo 1 e máximo 100 caracteres.
 */
export const searchTermSchema = z
  .string()
  .trim()
  .min(1, "O termo de busca é obrigatório")
  .max(100, "O termo de busca deve ter no máximo 100 caracteres");

/**
 * Schema de intervalo de datas: `from`/`to` no formato YYYY-MM-DD,
 * validando que `from` não seja depois de `to`.
 */
export const dateRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
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
