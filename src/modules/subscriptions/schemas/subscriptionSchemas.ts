import { z } from "zod";

const identificationSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  number: z.string().min(11).max(14).regex(/^\d+$/, "Apenas números")
});

/** Cartão informado no checkout do app. O Fastify só repassa à Asaas e não persiste PAN/CVV. */
export const asaasCreditCardSchema = z.object({
  holderName: z.string().trim().min(2).max(80),
  number: z.string().regex(/^\d{13,19}$/, "Número do cartão inválido"),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, "Mês de validade inválido"),
  expiryYear: z.string().regex(/^\d{4}$/, "Ano de validade inválido"),
  ccv: z.string().regex(/^\d{3,4}$/, "CVV inválido"),
  postalCode: z.string().regex(/^\d{8}$/, "CEP inválido"),
  addressNumber: z.string().trim().min(1).max(20),
  phone: z.string().regex(/^\d{10,11}$/, "Telefone inválido"),
});

export type AsaasCreditCardInput = z.infer<typeof asaasCreditCardSchema>;

export const subscribeSchema = z
  .object({
    barbershopId: z.string().uuid().optional(),
    planId: z.string().uuid("planId inválido"),
    paymentMethod: z.enum(["pix", "credit_card", "payment_link", "asaas"]),
    asaasBillingType: z.enum(["PIX", "CREDIT_CARD"]).optional(),
    cardToken: z.string().optional(),
    cardPaymentMethodId: z.string().optional(),
    asaasCreditCard: asaasCreditCardSchema.optional(),
    payerEmail: z.string().email("E-mail inválido"),
    payerFirstName: z.string().optional(),
    payerLastName: z.string().optional(),
    payerIdentification: identificationSchema.optional()
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === "asaas" && data.asaasBillingType === "CREDIT_CARD" && !data.asaasCreditCard) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["asaasCreditCard"],
        message: "Informe os dados do cartão para pagar nesta página"
      });
    }
    if (data.paymentMethod === "asaas" && data.asaasBillingType !== "CREDIT_CARD" && data.asaasCreditCard) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["asaasCreditCard"],
        message: "Dados de cartão só são aceitos no pagamento com cartão"
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
  asaasCreditCard: asaasCreditCardSchema,
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type SetupTrialCardInput = z.infer<typeof setupTrialCardSchema>;
