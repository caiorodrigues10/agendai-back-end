import { z } from "zod";
import { RESERVATION_MAX_QUANTITY, RESERVATION_MIN_QUANTITY } from "./reservationRules";

/** Mesmo formato do phoneBR de appointmentSchemas.ts: só dígitos, 10–11. */
const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: "WhatsApp inválido (DDD + número com 8 ou 9 dígitos)",
  });

/** Rota pública de produtos do salão: GET/POST /barbershops/:id/public-products[...] */
export const publicBarbershopParamsSchema = z.object({
  id: z.string().uuid("id de salão inválido"),
});

export const publicProductParamsSchema = z.object({
  id: z.string().uuid("id de salão inválido"),
  productId: z.string().uuid("id de produto inválido"),
});

/** POST /barbershops/:id/public-products/:productId/reservations */
export const createProductReservationSchema = z.object({
  customerName: z.string().trim().min(2, "Informe seu nome").max(160),
  whatsapp: phoneBR,
  quantity: z
    .number()
    .int("Quantidade deve ser um número inteiro")
    .min(RESERVATION_MIN_QUANTITY)
    .max(RESERVATION_MAX_QUANTITY)
    .default(1),
});

/** GET /product-reservations */
export const productListReservationsQuerySchema = z.object({
  status: z.enum(["RESERVED", "PICKED_UP", "CANCELED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** PATCH /product-reservations/:id/status */
export const productReservationIdParamsSchema = z.object({
  id: z.string().uuid("id de reserva inválido"),
});

export const updateProductReservationStatusSchema = z.object({
  // RESERVED é o status inicial e não é um alvo válido: só PICKED_UP/CANCELED finalizam.
  status: z.enum(["PICKED_UP", "CANCELED"]),
});
