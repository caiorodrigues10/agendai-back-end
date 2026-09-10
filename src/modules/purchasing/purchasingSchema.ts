import { z } from "zod";

export const createOrderSchema = z.object({
  barbershopId: z.string().uuid(),
  supplierId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  expectedAt: z.string().datetime().optional().nullable(),
});

export const updateOrderSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  status: z.enum(["DRAFT", "SENT", "RECEIVED", "CANCELED"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  expectedAt: z.string().datetime().optional().nullable(),
});

export const addItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1).max(200),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
});

export const receiveOrderSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().uuid(),
    receivedQuantity: z.number().int().min(0),
  })).optional(),
});

export const orderListQuerySchema = z.object({
  status: z.enum(["DRAFT", "SENT", "RECEIVED", "CANCELED"]).optional(),
});
