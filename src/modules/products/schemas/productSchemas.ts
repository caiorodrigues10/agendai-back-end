import { z } from "zod";

export const retailPaymentMethodSchema = z.enum(["cash", "pix", "credit_card", "debit_card", "fiado"]);

export const retailSalePayloadSchema = z.object({
  paymentMethod: retailPaymentMethodSchema,
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive().max(999),
    unitPrice: z.number().min(0).optional(),
  })).min(1).max(50),
  discount: z.number().min(0).optional(),
  clientId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
});

const stockUnitEnum = z.enum(["UNIT", "ML", "L", "G", "KG", "BOX", "PACK", "OTHER"]);

/** YYYY-MM-DD calendar date validation (real calendar, year 2000–2100). */
const expirationDateSchema = z.string()
  .trim()
  .max(0)
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"))
  .optional()
  .nullable()
  .refine((v) => {
    if (!v || v === "") return true;
    const [y, m, d] = v.split("-").map(Number);
    if (y < 2000 || y > 2100) return false;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }, "Data de validade inválida")
  .transform((v) => {
    if (!v || v === "") return null;
    // Return midnight UTC Date (matches @db.Date behavior)
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  });

/** Base schema shared by create and update. */
const productBaseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(400).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  sku: z.string().trim().max(60).optional().nullable(),
  barcode: z.string().trim().max(80).optional().nullable(),
  imageUrl: z.string().url().max(500).optional().nullable(),
  unit: stockUnitEnum.optional(),
  unitLabel: z.string().trim().min(1).max(40).optional(),
  salePrice: z.number().min(0),
  minStock: z.number().min(0).optional(),
  type: z.enum(["RETAIL", "CONSUMABLE", "BOTH"]).optional(),
  trackStock: z.boolean().optional(),
  active: z.boolean().optional(),
  expirationDate: expirationDateSchema,
  lotNumber: z.string().trim().max(60).optional().nullable().transform((v) => v === "" ? null : v),
});

/**
 * Create product schema: all fields required where appropriate.
 * superRefine: if unit === OTHER, unitLabel is required.
 */
export const createProductSchema = productBaseSchema.superRefine((data, ctx) => {
  if (data.unit === "OTHER" && !data.unitLabel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Quando a unidade é 'Outra', o nome da unidade é obrigatório",
      path: ["unitLabel"],
    });
  }
});

/**
 * Update product schema: all fields optional (partial).
 * superRefine: if unit === OTHER, unitLabel is required.
 */
export const updateProductSchema = productBaseSchema.partial().superRefine((data, ctx) => {
  if (data.unit === "OTHER" && !data.unitLabel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Quando a unidade é 'Outra', o nome da unidade é obrigatório",
      path: ["unitLabel"],
    });
  }
});

export const listProductsQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  categoryId: z.string().uuid().optional(),
  active: z.enum(["true", "false"]).optional(),
  type: z.enum(["RETAIL", "CONSUMABLE", "BOTH"]).optional(),
  /** sale → RETAIL+BOTH (alias de forSale=true); own → CONSUMABLE+BOTH */
  purpose: z.enum(["sale", "own"]).optional(),
  lowStock: z.enum(["true", "false"]).optional(),
  forSale: z.enum(["true", "false"]).optional(),
  expiry: z.enum(["expired", "expiring"]).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).superRefine((data, ctx) => {
  if (data.expiry && data.lowStock === "true") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Filtros 'expiry' e 'lowStock' não podem ser usados juntos",
      path: ["expiry"],
    });
  }
});

export const productCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(16).optional(),
  icon: z.string().trim().max(40).optional(),
  active: z.boolean().optional(),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  whatsapp: z.string().trim().max(20).optional().nullable(),
  email: z.string().email().max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  active: z.boolean().optional(),
});

export const createReceiptSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  supplierName: z.string().trim().max(200).optional().nullable(),
  receivedAt: z.coerce.date().optional(),
  paymentMethod: z.string().trim().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  createExpense: z.boolean().optional(),
  skipExpenseReason: z.string().trim().max(300).optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    unitCost: z.number().min(0),
  })).min(1).max(100),
});

export const reverseReceiptSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().refine((n) => n !== 0, "Informe uma quantidade diferente de zero"),
  reason: z.string().trim().min(3).max(300),
  type: z.enum(["MANUAL_ADJUSTMENT", "INTERNAL_CONSUMPTION"]).optional(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createRetailSaleSchema = retailSalePayloadSchema
  .extend({
    clientId: z.string().uuid().optional().nullable(),
    queueItemId: z.string().uuid().optional().nullable(),
    appointmentId: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === "fiado" && !data.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Venda fiada exige cliente identificado",
        path: ["clientId"],
      });
    }
  });

export const refundRetailSaleSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  restock: z.boolean().default(true),
  refundMethod: z.enum(["cash", "pix", "credit_card", "debit_card", "fiado_credit"]),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
  })).min(1),
});

export const reportsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const installTemplateSchema = z.object({
  segment: z.enum([
    "BARBERSHOP",
    "HAIR_SALON",
    "BEAUTY_STUDIO",
    "NAIL_STUDIO",
    "LASH_BROW_STUDIO",
    "AESTHETICS",
    "SPA",
    "OTHER",
  ]).optional(),
  include: z.object({
    serviceCategories: z.boolean().optional(),
    productCategories: z.boolean().optional(),
    expenseCategories: z.boolean().optional(),
    services: z.boolean().optional(),
    products: z.boolean().optional(),
  }).optional(),
});
