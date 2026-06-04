import { z } from "zod";

const identificationSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  number: z
    .string()
    .min(11, "CPF deve ter 11 dígitos ou CNPJ 14 dígitos")
    .max(14)
    .regex(/^\d+$/, "Apenas números são aceitos")
});

const cardPayerSchema = z.object({
  email: z.string().email("E-mail inválido"),
  identification: identificationSchema,
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

const billingAddressSchema = z.object({
  zipCode: z.string().min(8).max(9),
  streetName: z.string().min(1),
  streetNumber: z.string().min(1),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  federalUnit: z.string().length(2).optional()
});

// FIX-2: .multipleOf(0.01) falha para valores como 49.99 por imprecisão
// de ponto flutuante em JS (49.99 % 0.01 !== 0 em binário).
// Solução: validar que o valor tem no máximo 2 casas decimais via refine().
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.round(value * 100) / 100 === value ||
    Number(value.toFixed(2)) === value;
}

const transactionAmountSchema = z
  .number()
  .positive("Valor deve ser positivo")
  .refine(hasAtMostTwoDecimals, {
    message: "Valor deve ter no máximo 2 casas decimais"
  });

export const createCardPaymentSchema = z.object({
  token: z.string().min(1, "Token do cartão é obrigatório"),
  transactionAmount: transactionAmountSchema,
  description: z.string().min(1).max(256),
  installments: z.number().int().min(1).max(12),
  paymentMethodId: z.string().min(1, "Método de pagamento obrigatório"),
  issuerId: z.string().optional(),
  payer: cardPayerSchema,
  billingAddress: billingAddressSchema.optional(),
  barbershopId: z.string().uuid("barbershopId inválido"),
  serviceId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  queueItemId: z.string().uuid().optional(),
  externalReference: z.string().max(64).optional()
});

export const createPixPaymentSchema = z.object({
  transactionAmount: transactionAmountSchema,
  description: z.string().min(1).max(256),
  payer: z.object({
    email: z.string().email("E-mail inválido"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    identification: identificationSchema.optional()
  }),
  barbershopId: z.string().uuid("barbershopId inválido"),
  serviceId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  queueItemId: z.string().uuid().optional(),
  externalReference: z.string().max(64).optional(),
  expirationMinutes: z.number().int().min(5).max(1440).default(30)
});

export const getPaymentStatusSchema = z.object({
  id: z.string().uuid("ID inválido")
});

export type CreateCardPaymentInput = z.infer<typeof createCardPaymentSchema>;
export type CreatePixPaymentInput = z.infer<typeof createPixPaymentSchema>;
