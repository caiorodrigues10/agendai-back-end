import { z } from "zod";

const identificationSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  number: z.string().min(11).max(14).regex(/^\d+$/, "Apenas números")
});

export const subscribeSchema = z
  .object({
    barbershopId: z.string().uuid().optional(),
    planId: z.string().uuid("planId inválido"),
    paymentMethod: z.enum(["pix", "credit_card", "payment_link", "asaas"]),
    asaasBillingType: z.enum(["PIX", "CREDIT_CARD"]).optional(),
    cardToken: z.string().optional(),
    cardPaymentMethodId: z.string().optional(),
    /** Recusado de propósito: PAN/CVV não podem chegar ao Fastify. */
    asaasCreditCard: z.unknown().optional(),
    payerEmail: z.string().email("E-mail inválido"),
    payerFirstName: z.string().optional(),
    payerLastName: z.string().optional(),
    payerIdentification: identificationSchema.optional()
  })
  .superRefine((data, ctx) => {
    if (data.asaasCreditCard != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["asaasCreditCard"],
        message: "Dados de cartão não são aceitos no servidor. Use o checkout hospedado Asaas."
      });
    }
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
  asaasCreditCard: z.unknown().optional(),
}).superRefine((data, ctx) => {
  if (data.asaasCreditCard != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["asaasCreditCard"],
      message: "PAN/CVV não são aceitos no servidor. O cartão é informado no checkout hospedado Asaas."
    });
  }
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type SetupTrialCardInput = z.infer<typeof setupTrialCardSchema>;
