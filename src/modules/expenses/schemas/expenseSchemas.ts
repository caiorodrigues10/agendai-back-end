import { z } from "zod";
import { MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH } from "@/shared/constants/money";
import {
  booleanQuerySchema,
  dateOnlySchema,
  paginationQuerySchema as basePaginationQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/shared/utils/pagination";

export const createExpenseSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional().nullable(),
  amount: z.number().positive("Valor deve ser positivo").max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH),
  type: z.enum(["FIXED", "VARIABLE", "INVESTMENT"]).default("VARIABLE"),
  recurrence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).default("ONCE"),
  referenceDate: z.coerce.date({ required_error: "Data de referência obrigatória" }),
  paidAt: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  paymentMethod: z.string().max(50).optional().nullable(),
  supplierName: z.string().max(200).optional().nullable(),
  receiptUrl: z.string().url().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateExpenseSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  amount: z.number().positive().max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH).optional(),
  type: z.enum(["FIXED", "VARIABLE", "INVESTMENT"]).optional(),
  recurrence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  referenceDate: z.coerce.date().optional(),
  paidAt: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  paymentMethod: z.string().max(50).optional().nullable(),
  supplierName: z.string().max(200).optional().nullable(),
  receiptUrl: z.string().url().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

/** Tipos de despesa (enum `ExpenseType` do schema.prisma). */
export const EXPENSE_TYPE_VALUES = ["FIXED", "VARIABLE", "INVESTMENT"] as const;

/** Recorrências de despesa (enum `ExpenseRecurrence` do schema.prisma). */
export const EXPENSE_RECURRENCE_VALUES = [
  "ONCE",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
] as const;

/**
 * Situações de pagamento aceitas no filtro `payment`.
 *
 * Não existe enum de pagamento em `Expense`: o status é **derivado** dos
 * campos `paidAt` (data do pagamento) e `dueDate` (vencimento):
 * - `paid` => `paidAt IS NOT NULL` (paga, vencimento é irrelevante);
 * - `pending` => `paidAt IS NULL` (não paga — **inclui** as vencidas);
 * - `overdue` => `paidAt IS NULL AND dueDate < agora` (não paga e vencida —
 *   comparação estrita, então vence em `dueDate == agora` ainda não conta).
 */
export const EXPENSE_PAYMENT_VALUES = ["paid", "pending", "overdue"] as const;

/** Máximo de situações de pagamento aceitas em uma mesma listagem. */
export const MAX_EXPENSE_PAYMENT_FILTER = 3;

/** Campos de ordenação aceitos na listagem. */
export const EXPENSE_SORT_FIELDS = [
  "referenceDate",
  "amount",
  "dueDate",
  "createdAt",
] as const;

/**
 * Filtro de pagamento que aceita **um** valor ou uma lista separada por
 * vírgula: `payment=pending,overdue`.
 *
 * Lista vazia (`payment=` ou `payment=,,`) e valor fora do conjunto são 400.
 */
const expensePaymentListSchema = z
  .string()
  .transform((value, ctx) => {
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lista de pagamento vazia",
        path: ["payment"],
      });
      return z.NEVER;
    }
    return parts;
  })
  .pipe(
    z
      .array(z.enum(EXPENSE_PAYMENT_VALUES))
      .max(
        MAX_EXPENSE_PAYMENT_FILTER,
        `No máximo ${MAX_EXPENSE_PAYMENT_FILTER} situações de pagamento por listagem`,
      ),
  )
  .optional();

/**
 * Query da listagem de despesas.
 *
 * - `from`/`to` filtram **`referenceDate`** (data de competência) em dias civis
 *   (`YYYY-MM-DD`) com limites do **dia civil do salão** (`civilDayBounds`
 *   com o fuso do salão): `from` inclusivo a partir da meia-noite local do dia
 *   e `to` **exclusivo** na meia-noite local do dia seguinte — assim o último
 *   dia do intervalo entra inteiro. Como `referenceDate` é um `DateTime`
 *   (timestamp, não `@db.Date`), o dia é o do salão, não o UTC.
 * - `payment` deriva o status de pagamento de `paidAt`/`dueDate` (ver
 *   `EXPENSE_PAYMENT_VALUES`). `paid` e `pending`/`overdue` são mutuamente
 *   excludentes: a combinação é **400** (contraditória). `pending` +
 *   `overdue` é aceita e resulta em `overdue` (subconjunto).
 * - `paid` (booleano) continua existindo por compatibilidade: `true` equivale a
 *   `payment=paid` e `false` a `payment=pending`.
 * - `paymentMethod` **não tem enum** no `schema.prisma` (`String? @db.VarChar(50)`),
 *   então o filtro aceita qualquer texto de até 50 caracteres e compara por
 *   igualdade, sem diferenciar maiúsculas de minúsculas — valor desconhecido
 *   resulta em lista vazia, não em 400.
 * - `sort` aceita apenas `referenceDate`, `amount`, `dueDate` e `createdAt`
 *   com `:asc`/`:desc`.
 */
export const listExpensesQuerySchema = basePaginationQuerySchema({
  defaultLimit: 20,
  maxLimit: 100,
})
  .extend({
    categoryId: z.string().uuid().optional(),
    type: z.enum(EXPENSE_TYPE_VALUES).optional(),
    recurrence: z.enum(EXPENSE_RECURRENCE_VALUES).optional(),
    payment: expensePaymentListSchema,
    paymentMethod: z.string().trim().min(1).max(50).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    paid: booleanQuerySchema.optional(),
    search: searchTermSchema({ max: 100 }),
    sort: sortSchema(EXPENSE_SORT_FIELDS),
  })
  .refine((v) => !(v.from && v.to && v.from > v.to), {
    message: "`from` não pode ser depois de `to`",
    path: ["from"],
  })
  .refine(
    (v) => {
      const effective = new Set<string>(v.payment ?? []);
      if (v.paid === true) effective.add("paid");
      if (v.paid === false) effective.add("pending");
      const pago = effective.has("paid");
      const pendente = effective.has("pending");
      const vencido = effective.has("overdue");
      return !(pago && (pendente || vencido));
    },
    {
      message: "`payment` não pode combinar `paid` com `pending`/`overdue`",
      path: ["payment"],
    },
  );

export const expenseSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});