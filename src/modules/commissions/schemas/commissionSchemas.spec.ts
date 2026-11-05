import { describe, expect, it } from "vitest";
import { listCommissionsQuerySchema } from "./commissionSchemas";

describe("modules/commissions — listCommissionsQuerySchema (migrado ao helper)", () => {
  it("primeira página: defaults page=1, limit=20", () => {
    const parsed = listCommissionsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("aceita limit explícito até o teto 100", () => {
    expect(listCommissionsQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => listCommissionsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => listCommissionsQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("aceita professionalId uuid e origin válidos", () => {
    const parsed = listCommissionsQuerySchema.parse({
      professionalId: "11111111-1111-1111-1111-111111111111",
      origin: "QUEUE",
    });
    expect(parsed.professionalId).toBe("11111111-1111-1111-1111-111111111111");
    expect(parsed.origin).toBe("QUEUE");
  });

  it("rejeita professionalId não-uuid → 400", () => {
    expect(() =>
      listCommissionsQuerySchema.parse({ professionalId: "não-é-uuid" }),
    ).toThrow();
  });

  it("rejeita origin fora do enum → 400", () => {
    expect(() => listCommissionsQuerySchema.parse({ origin: "OUTRO" })).toThrow();
  });
});
