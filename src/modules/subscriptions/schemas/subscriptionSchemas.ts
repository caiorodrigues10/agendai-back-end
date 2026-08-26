import { z } from "zod";

const identificationSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  number: z.string().min(11).max(14).regex(/^\d+$/, "Apenas números")
});

/** Dados do cartão + endereço do titular exigidos pelo Asaas em CREDIT_CARD. */
const asaasCreditCardSchema = z.object({
  holderName: z.string().min(2).max(100),
  number: z.string().regex(/^\d{13,19}$/, "Número do cartão inválido"),
  expiryMonth: z.string().regex(/^\d{1,2}$/, "Mês inválido"),
  expiryYear: z.string().regex(/^\d{2,4}$/, "Ano inválido"),
  ccv: z.string().regex(/^\d{3,4}$/, "CVV inválido"),
  postalCode: z
    .string()
    .regex(/^\d{8}$/, "CEP deve ter 8 dígitos"),
  addressNumber: z.string().min(1).max(20),
  phone: z.string().regex(/^\d{10,11}$/, "Telefone inválido")
});

export const subscribeSchema = z
  .object({
    barbershopId: z.string().uuid().optional(),
    planId: z.string().uuid("planId inválido"),
    paymentMethod: z.enum(["pix", "credit_card", "payment_link", "asaas"]),
    asaasBillingType: z.enum(["PIX", "CREDIT_CARD"]).optional(),
    cardToken: z.string().optional(),
    cardPaymentMethodId: z.string().optional(),
    /** Cartão Asaas enviado ao backend (createPayment com creditCard). */
    asaasCreditCard: asaasCreditCardSchema.optional(),
    payerEmail: z.string().email("E-mail inválido"),
    payerFirstName: z.string().optional(),
    payerLastName: z.string().optional(),
    payerIdentification: identificationSchema.optional()
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === "credit_card") {
      if (!data.cardToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cardToken"],
          message: "cardToken é obrigatório para pagamento com cartão"
        });
      }
      if (!data.cardPaymentMethodId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cardPaymentMethodId"],
          message: "cardPaymentMethodId é obrigatório para pagamento com cartão"
        });
      }
    }
    if (data.paymentMethod === "asaas" && data.asaasBillingType === "CREDIT_CARD") {
      if (!data.asaasCreditCard && !data.cardToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["asaasCreditCard"],
          message: "Dados do cartão são obrigatórios para pagamento Asaas no cartão"
        });
      }
      if (!data.payerIdentification) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payerIdentification"],
          message: "CPF/CNPJ é obrigatório para pagamento Asaas no cartão"
        });
      }
    }
  });

export const setupTrialCardSchema = z.object({
  planId: z.string().uuid("planId inválido"),
  payerEmail: z.string().email("E-mail inválido"),
  payerFirstName: z.string().optional(),
  payerLastName: z.string().optional(),
  payerIdentification: identificationSchema,
  asaasCreditCard: asaasCreditCardSchema,
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type SetupTrialCardInput = z.infer<typeof setupTrialCardSchema>;
