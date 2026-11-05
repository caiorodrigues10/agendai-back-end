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
