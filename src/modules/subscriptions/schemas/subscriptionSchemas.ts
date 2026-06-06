import { z } from "zod";

const identificationSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  number: z.string().min(11).max(14).regex(/^\d+$/, "Apenas números")
});

export const subscribeSchema = z
  .object({
    planId: z.string().uuid("planId inválido"),
    paymentMethod: z.enum(["pix", "credit_card"]),
    cardToken: z.string().optional(),
    cardPaymentMethodId: z.string().optional(),
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
  });

export type SubscribeInput = z.infer<typeof subscribeSchema>;