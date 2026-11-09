import { describe, expect, it } from "vitest";
import { listExpensesQuerySchema } from "./expenseSchemas";

describe("modules/expenses — listExpensesQuerySchema: paginação", () => {
  it("primeira página: defaults page=1, limit=20", () => {
    const parsed = listExpensesQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("aceita limit explícito até o teto 100", () => {
    expect(listExpensesQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => listExpensesQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => listExpensesQuerySchema.parse({ page: 0 })).toThrow();
  });
});

describe("modules/expenses — listExpensesQuerySchema: payment", () => {
  it("aceita valor único", () => {
    expect(listExpensesQuerySchema.parse({ payment: "paid" }).payment).toEqual([
      "paid",
    ]);
  });

  it("aceita lista separada por vírgula", () => {
    expect(
      listExpensesQuerySchema.parse({ payment: "pending,overdue" }).payment
    ).toEqual(["pending", "overdue"]);
  });

  it("lista com os 3 valores é contraditória (paid x pending) → 400", () => {
    expect(() =>
      listExpensesQuerySchema.parse({ payment: "paid,pending,overdue" })
    ).toThrow();
  });

  it("rejeita valor fora do conjunto → 400", () => {
    expect(() => listExpensesQuerySchema.parse({ payment: "quitada" })).toThrow();
  });

  it("rejeita lista vazia → 400", () => {
    expect(() => listExpensesQuerySchema.parse({ payment: "" })).toThrow();
    expect(() => listExpensesQuerySchema.parse({ payment: ",," })).toThrow();
  });

  it("rejeita lista com valor inválido entre válidos → 400", () => {
    expect(() =>
      listExpensesQuerySchema.parse({ payment: "pending,quitada" })
    ).toThrow();
  });

  it("rejeita paid junto de pending/overdue (contraditório) → 400", () => {
    expect(() =>
      listExpensesQuerySchema.parse({ payment: "paid,pending" })
    ).toThrow();
    expect(() =>
      listExpensesQuerySchema.parse({ payment: "paid,overdue" })
    ).toThrow();
  });

  it("aceita pending + overdue (overdue é subconjunto de pending)", () => {
    expect(
      listExpensesQuerySchema.parse({ payment: "pending,overdue" }).payment
    ).toEqual(["pending", "overdue"]);
  });

  it("paid legado: true/false continuam válidos", () => {
    expect(listExpensesQuerySchema.parse({ paid: "true" }).paid).toBe(true);
    expect(listExpensesQuerySchema.parse({ paid: "false" }).paid).toBe(false);
  });

  it("paid=true com payment=overdue → 400 (contraditório)", () => {
    expect(() =>
      listExpensesQuerySchema.parse({ paid: "true", payment: "overdue" })
    ).toThrow();
    expect(() =>
      listExpensesQuerySchema.parse({ paid: "false", payment: "paid" })
    ).toThrow();
  });

  it("paid=false com payment=overdue → aceito (interseção)", () => {
    expect(
      listExpensesQuerySchema.parse({ paid: "false", payment: "overdue" })
        .payment
    ).toEqual(["overdue"]);
  });

  it("sem payment: filtro ausente", () => {
    expect(listExpensesQuerySchema.parse({}).payment).toBeUndefined();
  });
});

describe("modules/expenses — listExpensesQuerySchema: período", () => {
  it("aceita from/to em YYYY-MM-DD", () => {
    const parsed = listExpensesQuerySchema.parse({
      from: "2026-10-05",
      to: "2026-10-07",
    });
    expect(parsed.from).toBe("2026-10-05");
    expect(parsed.to).toBe("2026-10-07");
  });

  it("rejeita data fora do formato → 400", () => {
    expect(() => listExpensesQuerySchema.parse({ from: "05/10/2026" })).toThrow();
  });

  it("rejeita data inexistente no calendário → 400", () => {
    expect(() => listExpensesQuerySchema.parse({ to: "2026-02-30" })).toThrow();
  });

  it("rejeita from depois de to → 400", () => {
    expect(() =>
      listExpensesQuerySchema.parse({ from: "2026-10-07", to: "2026-10-05" })
    ).toThrow();
  });
});

describe("modules/expenses — listExpensesQuerySchema: demais filtros", () => {
  it("categoryId exige uuid", () => {
    expect(
      listExpensesQuerySchema.parse({ categoryId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" })
        .categoryId
    ).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(() => listExpensesQuerySchema.parse({ categoryId: "abc" })).toThrow();
  });

  it("type aceita os valores do enum do schema", () => {
    expect(listExpensesQuerySchema.parse({ type: "FIXED" }).type).toBe("FIXED");
    expect(listExpensesQuerySchema.parse({ type: "VARIABLE" }).type).toBe(
      "VARIABLE"
    );
    expect(listExpensesQuerySchema.parse({ type: "INVESTMENT" }).type).toBe(
      "INVESTMENT"
    );
    expect(() => listExpensesQuerySchema.parse({ type: "OUTRO" })).toThrow();
  });

  it("recurrence aceita os valores do enum do schema", () => {
    expect(listExpensesQuerySchema.parse({ recurrence: "MONTHLY" }).recurrence).toBe(
      "MONTHLY"
    );
    expect(() => listExpensesQuerySchema.parse({ recurrence: "SEMANAL" })).toThrow();
  });

  it("paymentMethod aceita texto livre até 50 caracteres", () => {
    expect(listExpensesQuerySchema.parse({ paymentMethod: "pix" }).paymentMethod).toBe(
      "pix"
    );
    expect(() =>
      listExpensesQuerySchema.parse({ paymentMethod: "a".repeat(51) })
    ).toThrow();
  });

  it("busca vazia vira undefined (sem filtro), não 400", () => {
    expect(listExpensesQuerySchema.parse({ search: "" }).search).toBeUndefined();
    expect(listExpensesQuerySchema.parse({ search: "   " }).search).toBeUndefined();
  });

  it("busca é aparada", () => {
    expect(listExpensesQuerySchema.parse({ search: "  Aluguel  " }).search).toBe(
      "Aluguel"
    );
  });

  it("busca acima de 100 caracteres → 400", () => {
    expect(() => listExpensesQuerySchema.parse({ search: "a".repeat(101) })).toThrow();
  });
});

describe("modules/expenses — listExpensesQuerySchema: sort", () => {
  it("aceita os campos da whitelist", () => {
    expect(listExpensesQuerySchema.parse({ sort: "referenceDate:desc" }).sort).toEqual({
      field: "referenceDate",
      dir: "desc",
    });
    expect(listExpensesQuerySchema.parse({ sort: "amount:asc" }).sort).toEqual({
      field: "amount",
      dir: "asc",
    });
    expect(listExpensesQuerySchema.parse({ sort: "dueDate" }).sort).toEqual({
      field: "dueDate",
      dir: "asc",
    });
    expect(listExpensesQuerySchema.parse({ sort: "createdAt:desc" }).sort).toEqual({
      field: "createdAt",
      dir: "desc",
    });
  });

  it("sort fora da whitelist → 400", () => {
    expect(() => listExpensesQuerySchema.parse({ sort: "paidAt:asc" })).toThrow();
    expect(() => listExpensesQuerySchema.parse({ sort: "title" })).toThrow();
  });

  it("sort com direção inválida → 400", () => {
    expect(() => listExpensesQuerySchema.parse({ sort: "amount:up" })).toThrow();
  });
});
