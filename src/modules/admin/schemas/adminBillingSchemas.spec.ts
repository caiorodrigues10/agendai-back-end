import { describe, it, expect } from "vitest";
import { billingStatementQuerySchema } from "./adminBillingSchemas";

describe("billingStatementQuerySchema", () => {
  it("aceita query vazia e filtros válidos", () => {
    expect(billingStatementQuerySchema.safeParse({}).success).toBe(true);
    expect(
      billingStatementQuerySchema.safeParse({
        status: "OVERDUE",
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-31T23:59:59.999Z",
      }).success,
    ).toBe(true);
  });

  it("rejeita status fora do enum e datas inválidas", () => {
    expect(billingStatementQuerySchema.safeParse({ status: "ANY" }).success).toBe(false);
    expect(billingStatementQuerySchema.safeParse({ from: "não-é-data" }).success).toBe(false);
  });

  it("rejeita chaves desconhecidas (.strict)", () => {
    expect(billingStatementQuerySchema.safeParse({ extra: "x" }).success).toBe(false);
  });

  it("converte datas string em Date", () => {
    const parsed = billingStatementQuerySchema.parse({ from: "2026-10-01T00:00:00.000Z" });
    expect(parsed.from).toBeInstanceOf(Date);
  });
});
