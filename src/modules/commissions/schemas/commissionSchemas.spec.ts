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

describe("modules/commissions — listCommissionsQuerySchema: período", () => {
  it("aceita from/to em YYYY-MM-DD válido", () => {
    const parsed = listCommissionsQuerySchema.parse({
      from: "2026-10-05",
      to: "2026-10-07",
    });
    expect(parsed.from).toBe("2026-10-05");
    expect(parsed.to).toBe("2026-10-07");
  });

  it("rejeita data de calendário inexistente (2026-02-30) → 400", () => {
    expect(() => listCommissionsQuerySchema.parse({ from: "2026-02-30" })).toThrow();
    expect(() => listCommissionsQuerySchema.parse({ to: "2026-13-01" })).toThrow();
  });

  it("rejeita formato fora de YYYY-MM-DD → 400", () => {
    expect(() => listCommissionsQuerySchema.parse({ from: "05/10/2026" })).toThrow();
  });

  it("rejeita from depois de to → 400", () => {
    expect(() =>
      listCommissionsQuerySchema.parse({ from: "2026-10-07", to: "2026-10-05" }),
    ).toThrow();
  });

  it("aceita from igual a to (um único dia)", () => {
    const parsed = listCommissionsQuerySchema.parse({
      from: "2026-10-05",
      to: "2026-10-05",
    });
    expect(parsed.from).toBe("2026-10-05");
    expect(parsed.to).toBe("2026-10-05");
  });
});

describe("modules/commissions — listCommissionsQuerySchema: serviceId e sort", () => {
  it("aceita serviceId uuid", () => {
    const parsed = listCommissionsQuerySchema.parse({
      serviceId: "33333333-3333-3333-3333-333333333333",
    });
    expect(parsed.serviceId).toBe("33333333-3333-3333-3333-333333333333");
  });

  it("rejeita serviceId não-uuid → 400", () => {
    expect(() =>
      listCommissionsQuerySchema.parse({ serviceId: "não-é-uuid" }),
    ).toThrow();
  });

  it("sort aceita os campos da whitelist", () => {
    expect(listCommissionsQuerySchema.parse({ sort: "data:desc" }).sort).toEqual({
      field: "data",
      dir: "desc",
    });
    expect(listCommissionsQuerySchema.parse({ sort: "valor:asc" }).sort).toEqual({
      field: "valor",
      dir: "asc",
    });
    expect(listCommissionsQuerySchema.parse({ sort: "data" }).sort).toEqual({
      field: "data",
      dir: "asc",
    });
  });

  it("sort sem direção explícita usa asc; sem sort fica undefined", () => {
    expect(listCommissionsQuerySchema.parse({}).sort).toBeUndefined();
  });

  it("sort fora da whitelist → 400", () => {
    expect(() => listCommissionsQuerySchema.parse({ sort: "createdAt:asc" })).toThrow();
    expect(() => listCommissionsQuerySchema.parse({ sort: "amount:desc" })).toThrow();
    expect(() => listCommissionsQuerySchema.parse({ sort: "professionalName" })).toThrow();
  });

  it("sort com direção inválida → 400", () => {
    expect(() => listCommissionsQuerySchema.parse({ sort: "data:up" })).toThrow();
    expect(() => listCommissionsQuerySchema.parse({ sort: "valor:" })).toThrow();
  });
});
