/// <reference types="vitest/globals" />
import { commissionAmount, totalCommissionAmount } from "./commissionMath";
import { normalizePaymentMethod } from "./paymentMethod";
import {
  ledgerIdempotencyKey,
  ledgerSignedAmount,
  recordLedgerEntry,
  deleteLedgerEntries,
  summarizeCashByMethod,
  summarizeRevenue,
} from "./financialLedger";
import { calendarDateKey, shopDateKey, shopDayRange, shopMonthRange } from "./shopTime";

describe("commissionAmount — arredondamento único (centavos)", () => {
  it("calcula R$ 33,33 a 30% como R$ 10,00 (e não 9,999)", () => {
    expect(commissionAmount(33.33, 30)).toBe(10);
    expect(commissionAmount(33.33, 30)).toBe(10.0);
  });

  it("casos redondos permanecem exatos", () => {
    expect(commissionAmount(100, 30)).toBe(30);
    expect(commissionAmount(80, 30)).toBe(24);
    expect(commissionAmount(50, 0)).toBe(0);
    expect(commissionAmount(0, 30)).toBe(0);
  });

  it("arredonda para o centavo mais próximo", () => {
    expect(commissionAmount(10.01, 15)).toBe(1.5); // 1.5015 → 1.50
    expect(commissionAmount(19.99, 13)).toBe(2.6); // 2.5987 → 2.60
  });

  it("soma de divisões bate com o total", () => {
    expect(totalCommissionAmount(100, [{ percentage: 15 }, { percentage: 25 }])).toBe(40);
  });
});

describe("normalizePaymentMethod", () => {
  it("normaliza formats brutos dos diversos fluxos", () => {
    expect(normalizePaymentMethod("cash")).toBe("CASH");
    expect(normalizePaymentMethod("pix")).toBe("PIX");
    expect(normalizePaymentMethod("credit_card")).toBe("CREDIT_CARD");
    expect(normalizePaymentMethod("debit_card")).toBe("DEBIT_CARD");
    expect(normalizePaymentMethod("fiado")).toBe("FIADO");
    expect(normalizePaymentMethod("card")).toBe("CREDIT_CARD"); // pacotes
    expect(normalizePaymentMethod("CREDIT_CARD")).toBe("CREDIT_CARD");
    expect(normalizePaymentMethod(null)).toBe("OTHER");
    expect(normalizePaymentMethod("bitcoin")).toBe("OTHER");
  });
});

function fakeClient(existingId?: string) {
  const create = vi.fn().mockImplementation(async ({ data }: any) => ({ id: "ledger-1", ...data }));
  const findFirst = vi.fn().mockResolvedValue(existingId ? { id: existingId } : null);
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  return { client: { cashMovement: { findFirst, create, deleteMany } }, create, findFirst, deleteMany };
}

describe("recordLedgerEntry — idempotência", () => {
  const base = {
    barbershopId: "shop-1",
    kind: "SERVICE_SALE" as const,
    amount: 80,
    paymentMethod: "pix",
    sourceType: "APPOINTMENT",
    sourceId: "appt-1",
    createdBy: "user-1",
  };

  it("cria o lançamento com método normalizado e chave determinística", async () => {
    const { client, create } = fakeClient();
    const result = await recordLedgerEntry(client, base);
    expect(result).toEqual({ id: "ledger-1", created: true });
    const data = create.mock.calls[0][0].data;
    expect(data.type).toBe("SERVICE_SALE");
    expect(data.paymentMethod).toBe("PIX");
    expect(data.idempotencyKey).toBe(ledgerIdempotencyKey(base));
    expect(data.occurredAt).toBeInstanceOf(Date);
    expect(Number(data.amount)).toBe(80);
  });

  it("repetir a mesma origem não duplica", async () => {
    const { client, create } = fakeClient("existing-1");
    const result = await recordLedgerEntry(client, base);
    expect(result).toEqual({ id: "existing-1", created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it("corrida (P2002) não derruba a operação", async () => {
    const { client } = fakeClient();
    client.cashMovement.create = vi.fn().mockRejectedValue({ code: "P2002" });
    await expect(recordLedgerEntry(client, base)).resolves.toBeNull();
  });

  it("outro erro de banco propaga (a operação de origem deve falhar)", async () => {
    const { client } = fakeClient();
    client.cashMovement.create = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(recordLedgerEntry(client, base)).rejects.toThrow("db down");
  });

  it("fiado não vira entrada de caixa: método FIADO fica separado", () => {
    expect(ledgerSignedAmount("SERVICE_SALE", 100)).toBe(100);
    const rows = [
      { type: "SERVICE_SALE", amount: 100, paymentMethod: "FIADO", occurredAt: new Date(), sourceType: null, sourceId: null },
      { type: "PRODUCT_SALE", amount: 50, paymentMethod: "CASH", occurredAt: new Date(), sourceType: null, sourceId: null },
      { type: "EXPENSE", amount: 30, paymentMethod: "CASH", occurredAt: new Date(), sourceType: null, sourceId: null },
      { type: "REFUND", amount: 10, paymentMethod: "PIX", occurredAt: new Date(), sourceType: null, sourceId: null },
    ];
    const cash = summarizeCashByMethod(rows);
    expect(cash.CASH).toBe(20); // 50 − 30
    expect(cash.PIX).toBe(-10);
    expect(cash.FIADO).toBeUndefined(); // não movimenta caixa
  });

  it("receita soma serviços, produtos e pacotes e desconta estornos", () => {
    const rows = [
      { type: "SERVICE_SALE", amount: 80, paymentMethod: "PIX", occurredAt: new Date(), sourceType: null, sourceId: null },
      { type: "PRODUCT_SALE", amount: 50, paymentMethod: "CASH", occurredAt: new Date(), sourceType: null, sourceId: null },
      { type: "PACKAGE_SALE", amount: 200, paymentMethod: "CASH", occurredAt: new Date(), sourceType: null, sourceId: null },
      { type: "REFUND", amount: 20, paymentMethod: "CASH", occurredAt: new Date(), sourceType: null, sourceId: null },
      { type: "FIADO_PAYMENT", amount: 80, paymentMethod: "CASH", occurredAt: new Date(), sourceType: null, sourceId: null },
    ];
    const revenue = summarizeRevenue(rows);
    expect(revenue.services).toBe(80);
    expect(revenue.products).toBe(50);
    expect(revenue.packages).toBe(200);
    expect(revenue.refunds).toBe(20);
    expect(revenue.total).toBe(310); // FIADO_PAYMENT não é receita nova
  });

  it("deleteLedgerEntries remove por origem", async () => {
    const { client, deleteMany } = fakeClient();
    await deleteLedgerEntries(client, { barbershopId: "shop-1", sourceType: "EXPENSE", sourceId: "e-1", kind: "EXPENSE" });
    expect(deleteMany.mock.calls[0][0].where).toMatchObject({
      barbershopId: "shop-1",
      sourceType: "EXPENSE",
      sourceId: "e-1",
      type: "EXPENSE",
    });
  });
});

describe("fuso do salão — limites de dia/mês", () => {
  const tz = "America/Sao_Paulo"; // UTC−3

  it("venda às 23:30 e outra às 00:10 caem em dias diferentes", () => {
    const lateNight = new Date(Date.UTC(2026, 9, 3, 2, 30)); // 2026-10-02 23:30 BRT
    const afterMidnight = new Date(Date.UTC(2026, 9, 3, 3, 10)); // 2026-10-03 00:10 BRT
    expect(shopDateKey(lateNight, tz)).toBe("2026-10-02");
    expect(shopDateKey(afterMidnight, tz)).toBe("2026-10-03");
  });

  it("shopDayRange cobre o dia inteiro no fuso do salão", () => {
    const { start, end } = shopDayRange("2026-10-02", tz);
    expect(start.toISOString()).toBe("2026-10-02T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-03T02:59:59.999Z");
    expect(shopDateKey(start, tz)).toBe("2026-10-02");
    expect(shopDateKey(end, tz)).toBe("2026-10-02");
  });

  it("shopMonthRange cobre o mês no fuso do salão", () => {
    const { start, end } = shopMonthRange("2026-10", tz);
    expect(start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-01T02:59:59.999Z");
  });

  it("calendarDateKey preserva a data de calendário enviada pelo front", () => {
    expect(calendarDateKey(new Date(2026, 9, 2))).toBe("2026-10-02");
    expect(calendarDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
