import { z } from "zod";
import { MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH } from "@/shared/constants/money";
import {
  booleanQuerySchema,
  dateOnlySchema,
  paginationQuerySchema as basePaginationQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/shared/utils/pagination";
import type { FiadoSortField } from "../dtos/IFiadoDTO";

/** Formas de pagamento aceitas no recebimento de fiado (mesmo vocabulário do caixa). */
const paymentMethodEnum = z.enum(["cash", "pix", "credit_card", "debit_card", "card", "other"]);

export const createFiadoSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  customerName: z.string().min(2, "Nome obrigatório").max(200),
  whatsapp: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length >= 10 && value.length <= 13, {
      message: "WhatsApp inválido: informe DDD e telefone",
    }),
  clientId: z.string().uuid().optional().nullable(),
  description: z.string().min(2, "Descrição obrigatória").max(500),
  amount: z.number().positive("Valor deve ser positivo").max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH),
  dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const createFiadoPaymentSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  amount: z.number().positive("Valor deve ser positivo").max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH),
  paymentMethod: paymentMethodEnum.optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateFiadoSchema = z.object({
  description: z.string().min(2).max(500).optional(),
  amount: z.number().positive().max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH).optional(),
  dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "FORGIVEN"]).optional(),
});

export const addFiadoPaymentSchema = z.object({
  amount: z.number().positive("Valor deve ser positivo").max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH),
  paymentMethod: paymentMethodEnum.optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const chargeFiadoSchema = z
  .object({
    pixKey: z.string().trim().max(200).optional().or(z.literal("")),
    cardPaymentLink: z.string().trim().url("Link de cartão inválido").max(500).optional().or(z.literal("")),
  })
  .refine((data) => Boolean(data.pixKey || data.cardPaymentLink), {
    message: "Informe uma chave PIX ou um link para pagamento com cartão",
  });

/** Valores aceitos no filtro de status (enum `FiadoStatus` do schema.prisma). */
export const FIADO_STATUS_VALUES = ["PENDING", "PARTIAL", "PAID", "FORGIVEN"] as const;

/** Máximo de status aceitos em uma mesma listagem (tamanho do enum). */
export const MAX_FIADO_STATUS_FILTER = 4;

/** Status que ainda representam dívida em aberto (base do filtro `overdue`). */
export const OPEN_FIADO_STATUSES = ["PENDING", "PARTIAL"] as const;

/** Campos de ordenação aceitos na listagem de fiados. */
export const FIADO_SORT_FIELDS: readonly FiadoSortField[] = [
  "createdAt",
  "dueDate",
  "amount",
];

/**
 * Filtro de status que aceita **um** valor (como antes) ou uma lista separada
 * por vírgula: `status=PENDING,PARTIAL`.
 *
 * Lista vazia (`status=` ou `status=,,`) e valor fora do enum são 400.
 */
const fiadoStatusListSchema = z
  .string()
  .transform((value, ctx) => {
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lista de status vazia",
        path: ["status"],
      });
      return z.NEVER;
    }
    return parts;
  })
  .pipe(
    z
      .array(z.enum(FIADO_STATUS_VALUES))
      .max(
        MAX_FIADO_STATUS_FILTER,
        `No máximo ${MAX_FIADO_STATUS_FILTER} status por listagem`,
      ),
  )
  .optional();

/**
 * Query da listagem de fiados.
 *
 * - `from`/`to` filtram **`createdAt`** (data de criação) e `dueFrom`/`dueTo`
 *   filtram **`dueDate`** (vencimento). Ambos são dias civis (`YYYY-MM-DD`) com
 *   limites do **dia civil do salão** (`civilDayBounds` com o fuso do salão):
 *   `from`/`dueFrom` inclusivos a partir da meia-noite local do dia e
 *   `to`/`dueTo` **exclusivos** na meia-noite local do dia seguinte — assim o
 *   último dia do intervalo entra inteiro (o `lte` na meia-noite do próprio dia
 *   excluía tudo o que aconteceu depois dela).
 * - `overdue=true` significa "dívida em aberto e vencida": sempre exige status
 *   em `PENDING`/`PARTIAL` e `dueDate` anterior ao momento da consulta. Se o
 *   `status` vier no query e for incompatível (só `PAID`/`FORGIVEN`), a
 *   requisição é **400** (contraditória) em vez de devolver uma lista vazia em
 *   silêncio. Status parcialmente compatível (ex.: `PENDING,PAID`) é aceito e
 *   resulta na interseção com `PENDING`/`PARTIAL`.
 * - `sort` aceita apenas `createdAt`, `dueDate` e `amount` (`amount` = coluna
 *   `originalAmount`, o valor cobrado do fiado) com `:asc`/`:desc`.
 */
export const listFiadoQuerySchema = basePaginationQuerySchema({
  defaultLimit: 20,
  maxLimit: 100,
})
  .extend({
    status: fiadoStatusListSchema,
    clientId: z.string().uuid().optional(),
    search: searchTermSchema({ max: 100 }),
    overdue: booleanQuerySchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    dueFrom: dateOnlySchema.optional(),
    dueTo: dateOnlySchema.optional(),
    sort: sortSchema(FIADO_SORT_FIELDS),
  })
  .refine((v) => !(v.from && v.to && v.from > v.to), {
    message: "`from` não pode ser depois de `to`",
    path: ["from"],
  })
  .refine((v) => !(v.dueFrom && v.dueTo && v.dueFrom > v.dueTo), {
    message: "`dueFrom` não pode ser depois de `dueTo`",
    path: ["dueFrom"],
  })
  .refine(
    (v) =>
      !(
        v.overdue === true &&
        v.status &&
        v.status.length > 0 &&
        !v.status.some((s) => s === "PENDING" || s === "PARTIAL")
      ),
    {
      message: "`overdue=true` exige status PENDING ou PARTIAL",
      path: ["status"],
    },
  );

export type CreateFiadoInput = z.infer<typeof createFiadoSchema>;
export type UpdateFiadoInput = z.infer<typeof updateFiadoSchema>;
export type AddFiadoPaymentInput = z.infer<typeof addFiadoPaymentSchema>;
export type ListFiadoQueryInput = z.infer<typeof listFiadoQuerySchema>;
export type ChargeFiadoInput = z.infer<typeof chargeFiadoSchema>;
