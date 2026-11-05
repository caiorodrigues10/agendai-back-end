import { describe, expect, it } from "vitest";
import { listFiadoQuerySchema } from "./fiadoSchemas";

describe("modules/fiado — listFiadoQuerySchema (migrado ao helper)", () => {
  it("primeira página: defaults page=1, limit=20", () => {
    const parsed = listFiadoQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("aceita limit explícito até o teto 100", () => {
    expect(listFiadoQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => listFiadoQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("busca sem resultado não altera a validação da query", () => {
    const parsed = listFiadoQuerySchema.parse({ search: "inexistente", page: 1 });
    expect(parsed.search).toBe("inexistente");
    expect(parsed.page).toBe(1);
  });
});

describe("modules/fiado — listFiadoQuerySchema: status", () => {
  it("aceita status válido (valor único)", () => {
    expect(listFiadoQuerySchema.parse({ status: "PENDING" }).status).toEqual([
      "PENDING",
    ]);
  });

  it("aceita lista de status separada por vírgula", () => {
    expect(
      listFiadoQuerySchema.parse({ status: "PENDING,PARTIAL" }).status
    ).toEqual(["PENDING", "PARTIAL"]);
  });

  it("aceita lista com os 4 status do enum", () => {
    expect(
      listFiadoQuerySchema.parse({ status: "PENDING,PARTIAL,PAID,FORGIVEN" })
        .status
    ).toEqual(["PENDING", "PARTIAL", "PAID", "FORGIVEN"]);
  });

  it("rejeita status fora do enum → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ status: "QUITADO" })).toThrow();
  });

  it("rejeita lista vazia → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ status: "" })).toThrow();
    expect(() => listFiadoQuerySchema.parse({ status: ",," })).toThrow();
  });

  it("rejeita lista com um valor inválido entre válidos → 400", () => {
    expect(() =>
      listFiadoQuerySchema.parse({ status: "PENDING,QUITADO" })
    ).toThrow();
  });

  it("sem status: filtro ausente", () => {
    expect(listFiadoQuerySchema.parse({}).status).toBeUndefined();
  });
});

describe("modules/fiado — listFiadoQuerySchema: clientId", () => {
  it("aceita uuid válido", () => {
    const uuid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(listFiadoQuerySchema.parse({ clientId: uuid }).clientId).toBe(uuid);
  });

  it("rejeita clientId que não é uuid → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ clientId: "abc" })).toThrow();
  });
});

describe("modules/fiado — listFiadoQuerySchema: datas", () => {
  it("aceita from/to/dueFrom/dueTo em YYYY-MM-DD", () => {
    const parsed = listFiadoQuerySchema.parse({
      from: "2026-10-05",
      to: "2026-10-07",
      dueFrom: "2026-11-01",
      dueTo: "2026-11-30",
    });

    expect(parsed.from).toBe("2026-10-05");
    expect(parsed.to).toBe("2026-10-07");
    expect(parsed.dueFrom).toBe("2026-11-01");
    expect(parsed.dueTo).toBe("2026-11-30");
  });

  it("rejeita data fora do formato → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ from: "05/10/2026" })).toThrow();
  });

  it("rejeita data inexistente no calendário → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ from: "2026-02-30" })).toThrow();
  });

  it("rejeita from depois de to → 400", () => {
    expect(() =>
      listFiadoQuerySchema.parse({ from: "2026-10-07", to: "2026-10-05" })
    ).toThrow();
  });

  it("rejeita dueFrom depois de dueTo → 400", () => {
    expect(() =>
      listFiadoQuerySchema.parse({
        dueFrom: "2026-11-30",
        dueTo: "2026-11-01",
      })
    ).toThrow();
  });

  it("from/to e dueFrom/dueTo são pares independentes", () => {
    const parsed = listFiadoQuerySchema.parse({
      from: "2026-10-05",
      to: "2026-10-07",
      dueFrom: "2026-11-01",
      dueTo: "2026-11-30",
    });
    expect(parsed.from).toBe("2026-10-05");
    expect(parsed.dueFrom).toBe("2026-11-01");

    // O refine de from/to barra o par inválido mesmo com dueFrom/dueTo válidos.
    expect(() =>
      listFiadoQuerySchema.parse({
        from: "2026-10-07",
        to: "2026-10-05",
        dueFrom: "2026-11-01",
        dueTo: "2026-11-30",
      })
    ).toThrow();
  });
});

describe("modules/fiado — listFiadoQuerySchema: overdue", () => {
  it("aceita overdue=true/false como booleano", () => {
    expect(listFiadoQuerySchema.parse({ overdue: "true" }).overdue).toBe(true);
    expect(listFiadoQuerySchema.parse({ overdue: "false" }).overdue).toBe(false);
  });

  it("rejeita overdue fora de true/false → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ overdue: "1" })).toThrow();
  });

  it("overdue com status incompatível (PAID) → 400 (contraditório)", () => {
    expect(() =>
      listFiadoQuerySchema.parse({ overdue: "true", status: "PAID" })
    ).toThrow();
    expect(() =>
      listFiadoQuerySchema.parse({ overdue: "true", status: "FORGIVEN" })
    ).toThrow();
  });

  it("overdue com lista sem nenhum status em aberto → 400", () => {
    expect(() =>
      listFiadoQuerySchema.parse({ overdue: "true", status: "PAID,FORGIVEN" })
    ).toThrow();
  });

  it("overdue com status compatível → aceito", () => {
    expect(
      listFiadoQuerySchema.parse({ overdue: "true", status: "PENDING" }).status
    ).toEqual(["PENDING"]);
    expect(
      listFiadoQuerySchema.parse({ overdue: "true", status: "PARTIAL" }).status
    ).toEqual(["PARTIAL"]);
  });

  it("overdue com lista parcialmente compatível → aceito (interseção)", () => {
    expect(
      listFiadoQuerySchema.parse({ overdue: "true", status: "PENDING,PAID" })
        .status
    ).toEqual(["PENDING", "PAID"]);
  });

  it("overdue sem status → aceito (o filtro exige PENDING/PARTIAL)", () => {
    expect(listFiadoQuerySchema.parse({ overdue: "true" }).overdue).toBe(true);
  });
});

describe("modules/fiado — listFiadoQuerySchema: busca e sort", () => {
  it("busca vazia vira undefined (sem filtro), não 400", () => {
    expect(listFiadoQuerySchema.parse({ search: "" }).search).toBeUndefined();
    expect(listFiadoQuerySchema.parse({ search: "   " }).search).toBeUndefined();
  });

  it("busca é aparada", () => {
    expect(listFiadoQuerySchema.parse({ search: "  Ana  " }).search).toBe("Ana");
  });

  it("busca acima de 100 caracteres → 400", () => {
    expect(() =>
      listFiadoQuerySchema.parse({ search: "a".repeat(101) })
    ).toThrow();
  });

  it("sort aceita os campos da whitelist", () => {
    expect(listFiadoQuerySchema.parse({ sort: "createdAt:desc" }).sort).toEqual({
      field: "createdAt",
      dir: "desc",
    });
    expect(listFiadoQuerySchema.parse({ sort: "dueDate:asc" }).sort).toEqual({
      field: "dueDate",
      dir: "asc",
    });
    expect(listFiadoQuerySchema.parse({ sort: "amount" }).sort).toEqual({
      field: "amount",
      dir: "asc",
    });
  });

  it("sort fora da whitelist → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ sort: "paidAmount:asc" })).toThrow();
    expect(() => listFiadoQuerySchema.parse({ sort: "customerName" })).toThrow();
  });

  it("sort com direção inválida → 400", () => {
    expect(() => listFiadoQuerySchema.parse({ sort: "createdAt:up" })).toThrow();
  });
});
