import { describe, expect, it } from "vitest";
import { listAppointmentsQuerySchema } from "./appointmentSchemas";

describe("modules/appointments — listAppointmentsQuerySchema (migrado ao helper)", () => {
  it("primeira página: defaults page=1, limit=20", () => {
    const parsed = listAppointmentsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("aceita limit explícito até o teto 100", () => {
    expect(listAppointmentsQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => listAppointmentsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => listAppointmentsQuerySchema.parse({ page: 0 })).toThrow();
  });

  it("rejeita from depois de to", () => {
    expect(() =>
      listAppointmentsQuerySchema.parse({ from: "2026-02-01", to: "2026-01-31" }),
    ).toThrow();
  });

  it("aceita intervalo válido from <= to", () => {
    const parsed = listAppointmentsQuerySchema.parse({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(parsed.from).toBe("2026-01-01");
    expect(parsed.to).toBe("2026-01-31");
  });

  it("busca sem resultado não altera a validação da query", () => {
    const parsed = listAppointmentsQuerySchema.parse({
      search: "inexistente",
      page: 1,
    });
    expect(parsed.search).toBe("inexistente");
    expect(parsed.page).toBe(1);
  });
});

// ─── status: valor único (compatibilidade) e lista ────────────────────────

describe("modules/appointments — status em lista", () => {
  it("valor único continua aceito (compatibilidade)", () => {
    expect(listAppointmentsQuerySchema.parse({ status: "CONFIRMED" }).status).toEqual([
      "CONFIRMED",
    ]);
  });

  it("lista separada por vírgula vira array", () => {
    expect(
      listAppointmentsQuerySchema.parse({ status: "CONFIRMED,COMPLETED" }).status,
    ).toEqual(["CONFIRMED", "COMPLETED"]);
  });

  it("lista ignora espaços em volta dos valores", () => {
    expect(
      listAppointmentsQuerySchema.parse({ status: " CONFIRMED , COMPLETED " }).status,
    ).toEqual(["CONFIRMED", "COMPLETED"]);
  });

  it("aceita todos os cinco valores do enum", () => {
    const parsed = listAppointmentsQuerySchema.parse({
      status: "CONFIRMED,CANCELLED,COMPLETED,CHECKED_IN,NO_SHOW",
    });
    expect(parsed.status).toHaveLength(5);
  });

  it("rejeita lista acima de 5 valores → 400", () => {
    expect(() =>
      listAppointmentsQuerySchema.parse({
        status: "CONFIRMED,CANCELLED,COMPLETED,CHECKED_IN,NO_SHOW,CONFIRMED",
      }),
    ).toThrow();
  });

  it("rejeita lista vazia → 400", () => {
    expect(() => listAppointmentsQuerySchema.parse({ status: "" })).toThrow();
    expect(() => listAppointmentsQuerySchema.parse({ status: ",," })).toThrow();
  });

  it("rejeita valor fora do enum → 400", () => {
    expect(() => listAppointmentsQuerySchema.parse({ status: "CANCELADO" })).toThrow();
    expect(() =>
      listAppointmentsQuerySchema.parse({ status: "CONFIRMED,NAO_EXISTE" }),
    ).toThrow();
  });

  it("status ausente não gera filtro", () => {
    expect(listAppointmentsQuerySchema.parse({}).status).toBeUndefined();
  });
});

// ─── serviceId ───────────────────────────────────────────────────────────

describe("modules/appointments — serviceId", () => {
  it("aceita uuid válido", () => {
    const serviceId = "11111111-1111-4111-8111-111111111111";
    expect(listAppointmentsQuerySchema.parse({ serviceId }).serviceId).toBe(serviceId);
  });

  it("rejeita serviceId fora de uuid → 400", () => {
    expect(() => listAppointmentsQuerySchema.parse({ serviceId: "abc" })).toThrow();
    expect(() =>
      listAppointmentsQuerySchema.parse({ serviceId: "11111111-1111-4111-8111" }),
    ).toThrow();
  });
});

// ─── sort ────────────────────────────────────────────────────────────────

describe("modules/appointments — sort por data", () => {
  it("aceita date:asc e date:desc", () => {
    expect(listAppointmentsQuerySchema.parse({ sort: "date:asc" }).sort).toEqual({
      field: "date",
      dir: "asc",
    });
    expect(listAppointmentsQuerySchema.parse({ sort: "date:desc" }).sort).toEqual({
      field: "date",
      dir: "desc",
    });
  });

  it("rejeita campo fora da whitelist → 400", () => {
    expect(() => listAppointmentsQuerySchema.parse({ sort: "time:asc" })).toThrow();
    expect(() => listAppointmentsQuerySchema.parse({ sort: "createdAt:asc" })).toThrow();
  });

  it("rejeita direção inválida → 400", () => {
    expect(() => listAppointmentsQuerySchema.parse({ sort: "date:lateral" })).toThrow();
  });
});
