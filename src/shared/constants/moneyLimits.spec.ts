/// <reference types="vitest/globals" />
/**
 * Teto monetário nos schemas de rotas financeiras (FIX 2).
 *
 * Sem `.max()`, um `finalPrice`/`amount` gigante (1e15, 1e10) passava pela validação
 * e chegava ao repositório — estourando o `Decimal(12,2)` de `cash_movements`
 * (limite 10^10) e devolvendo 500, ou gravando valores absurdos.
 *
 * Prova: os schemas rejeitam 1e15 e 10000000000 (o middleware `validateSchema`
 * devolve 400 antes de qualquer escrita), e continuam aceitando 0 e valores
 * normais (inclusive `finalPrice` vindo do cliente — regra mantida).
 */
import { updateQueueItemSchema } from "@/modules/queue/schemas/queueSchemas";
import { retailSalePayloadSchema } from "@/modules/products/schemas/productSchemas";
import { createExpenseSchema } from "@/modules/expenses/schemas/expenseSchemas";
import { createFiadoSchema, addFiadoPaymentSchema } from "@/modules/fiado/schemas/fiadoSchemas";
import { creditWalletSchema } from "@/modules/wallet/walletSchema";
import { MAX_MONETARY_VALUE } from "@/shared/constants/money";

const HUGE = [1e15, 10_000_000_000];

function baseQueue(overrides: Record<string, unknown> = {}) {
  return { status: "completed", ...overrides };
}

describe("teto monetário (MAX_MONETARY_VALUE)", () => {
  it("define o teto em 100000", () => {
    expect(MAX_MONETARY_VALUE).toBe(100_000);
  });

  describe("updateQueueItemSchema.finalPrice", () => {
    it.each(HUGE)("rejeita finalPrice=%s", (value) => {
      const result = updateQueueItemSchema.safeParse(baseQueue({ finalPrice: value }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(JSON.stringify(result.error.issues)).toContain("Valor acima do limite");
      }
    });

    it("aceita finalPrice=0 (regra mantida)", () => {
      expect(updateQueueItemSchema.safeParse(baseQueue({ finalPrice: 0 })).success).toBe(true);
    });

    it("aceita finalPrice vindo do cliente dentro do teto (regra mantida)", () => {
      expect(updateQueueItemSchema.safeParse(baseQueue({ finalPrice: 123.45 })).success).toBe(true);
      expect(updateQueueItemSchema.safeParse(baseQueue({ finalPrice: MAX_MONETARY_VALUE })).success).toBe(true);
    });
  });

  describe("retailSalePayloadSchema (unitPrice / discount)", () => {
    const base = { paymentMethod: "cash", items: [{ productId: "a0000000-0000-4000-8000-000000000000", quantity: 1 }] };

    it.each(HUGE)("rejeita unitPrice=%s", (value) => {
      const r = retailSalePayloadSchema.safeParse({
        ...base,
        items: [{ ...base.items[0], unitPrice: value }],
      });
      expect(r.success).toBe(false);
    });

    it.each(HUGE)("rejeita discount=%s", (value) => {
      expect(retailSalePayloadSchema.safeParse({ ...base, discount: value }).success).toBe(false);
    });
  });

  describe("createExpenseSchema.amount", () => {
    it.each(HUGE)("rejeita amount=%s", (value) => {
      const r = createExpenseSchema.safeParse({
        title: "Aluguel",
        amount: value,
        referenceDate: "2026-10-01",
      });
      expect(r.success).toBe(false);
    });

    it("aceita amount normal", () => {
      expect(
        createExpenseSchema.safeParse({ title: "Aluguel", amount: 1500, referenceDate: "2026-10-01" }).success,
      ).toBe(true);
    });
  });

  describe("fiado (amount)", () => {
    it.each(HUGE)("rejeita createFiadoSchema.amount=%s", (value) => {
      const r = createFiadoSchema.safeParse({
        customerName: "Ana",
        whatsapp: "11999999999",
        description: "Fiado",
        amount: value,
      });
      expect(r.success).toBe(false);
    });

    it.each(HUGE)("rejeita addFiadoPaymentSchema.amount=%s", (value) => {
      expect(addFiadoPaymentSchema.safeParse({ amount: value }).success).toBe(false);
    });
  });

  describe("creditWalletSchema.amount", () => {
    it.each(HUGE)("rejeita amount=%s", (value) => {
      expect(creditWalletSchema.safeParse({ amount: value }).success).toBe(false);
    });
  });
});
