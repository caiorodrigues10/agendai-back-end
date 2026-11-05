import { describe, expect, it } from "vitest";
import { listClientsQuerySchema } from "./clientSchemas";

describe("modules/clients — listClientsQuerySchema (paginação + filtros novos)", () => {
  it("primeira página: defaults page=1, limit=20", () => {
    const parsed = listClientsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("aceita limit explícito até o teto 100", () => {
    expect(listClientsQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => listClientsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => listClientsQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("busca sem resultado não altera a validação da query", () => {
    const parsed = listClientsQuerySchema.parse({ search: "inexistente", page: 1 });
    expect(parsed.search).toBe("inexistente");
    expect(parsed.page).toBe(1);
  });

  it("busca respeita tamanho máximo (300)", () => {
    expect(() => listClientsQuerySchema.parse({ search: "a".repeat(301) })).toThrow();
    expect(listClientsQuerySchema.parse({ search: "a".repeat(300) }).search).toHaveLength(300);
  });

  it("busca vazia ou só com espaços → 400", () => {
    expect(() => listClientsQuerySchema.parse({ search: "" })).toThrow();
    expect(() => listClientsQuerySchema.parse({ search: "   " })).toThrow();
  });

  it("busca é aparada (trim)", () => {
    expect(listClientsQuerySchema.parse({ search: "  joão  " }).search).toBe("joão");
  });

  // ─── createdFrom / createdTo ───────────────────────────────

  it("aceita createdFrom/createdTo isolados", () => {
    expect(listClientsQuerySchema.parse({ createdFrom: "2026-01-01" }).createdFrom).toBe("2026-01-01");
    expect(listClientsQuerySchema.parse({ createdTo: "2026-01-31" }).createdTo).toBe("2026-01-31");
  });

  it("rejeita createdFrom/createdTo fora de YYYY-MM-DD → 400", () => {
    expect(() => listClientsQuerySchema.parse({ createdFrom: "01/01/2026" })).toThrow();
    expect(() => listClientsQuerySchema.parse({ createdTo: "2026-1-1" })).toThrow();
    expect(() => listClientsQuerySchema.parse({ createdFrom: "2026-13-01" })).toThrow();
  });

  it("rejeita createdFrom depois de createdTo → 400", () => {
    expect(() =>
      listClientsQuerySchema.parse({ createdFrom: "2026-02-01", createdTo: "2026-01-01" }),
    ).toThrow();
  });

  it("aceita createdFrom igual a createdTo", () => {
    expect(
      listClientsQuerySchema.parse({ createdFrom: "2026-01-01", createdTo: "2026-01-01" }),
    ).toMatchObject({ createdFrom: "2026-01-01", createdTo: "2026-01-01" });
  });

  // ─── inactiveDays ─────────────────────────────────────────

  it("aceita inactiveDays inteiro positivo", () => {
    expect(listClientsQuerySchema.parse({ inactiveDays: "30" }).inactiveDays).toBe(30);
  });

  it("rejeita inactiveDays zero, negativo ou fracionário → 400", () => {
    expect(() => listClientsQuerySchema.parse({ inactiveDays: 0 })).toThrow();
    expect(() => listClientsQuerySchema.parse({ inactiveDays: -5 })).toThrow();
    expect(() => listClientsQuerySchema.parse({ inactiveDays: 1.5 })).toThrow();
  });

  it("rejeita inactiveDays acima do teto (3650) → 400", () => {
    expect(() => listClientsQuerySchema.parse({ inactiveDays: 3651 })).toThrow();
    expect(listClientsQuerySchema.parse({ inactiveDays: 3650 }).inactiveDays).toBe(3650);
  });

  // ─── hasOpenFiado / hasActivePackage ───────────────────────

  it('converte hasOpenFiado/hasActivePackage de "true"/"false" para booleano', () => {
    expect(listClientsQuerySchema.parse({ hasOpenFiado: "true" }).hasOpenFiado).toBe(true);
    expect(listClientsQuerySchema.parse({ hasOpenFiado: "false" }).hasOpenFiado).toBe(false);
    expect(listClientsQuerySchema.parse({ hasActivePackage: "true" }).hasActivePackage).toBe(true);
    expect(listClientsQuerySchema.parse({ hasActivePackage: "false" }).hasActivePackage).toBe(false);
  });

  it("rejeita flag booleana fora de true/false → 400", () => {
    expect(() => listClientsQuerySchema.parse({ hasOpenFiado: "1" })).toThrow();
    expect(() => listClientsQuerySchema.parse({ hasActivePackage: "sim" })).toThrow();
  });

  // ─── sort ─────────────────────────────────────────────────

  it("aceita sort pela whitelist (name, lastVisitAt, createdAt)", () => {
    expect(listClientsQuerySchema.parse({ sort: "name:asc" }).sort).toEqual({
      field: "name",
      dir: "asc",
    });
    expect(listClientsQuerySchema.parse({ sort: "lastVisitAt:desc" }).sort).toEqual({
      field: "lastVisitAt",
      dir: "desc",
    });
    expect(listClientsQuerySchema.parse({ sort: "createdAt" }).sort).toEqual({
      field: "createdAt",
      dir: "asc",
    });
  });

  it("rejeita sort fora da whitelist → 400", () => {
    expect(() => listClientsQuerySchema.parse({ sort: "whatsapp:asc" })).toThrow();
    expect(() => listClientsQuerySchema.parse({ sort: "barbershopId:asc" })).toThrow();
  });

  it("rejeita direção de sort inválida → 400", () => {
    expect(() => listClientsQuerySchema.parse({ sort: "name:lateral" })).toThrow();
  });

  it("sort ausente não altera a validação da query", () => {
    expect(listClientsQuerySchema.parse({}).sort).toBeUndefined();
  });
});
