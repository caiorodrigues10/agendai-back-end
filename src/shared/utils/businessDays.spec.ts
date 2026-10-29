import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysUntil,
  countBusinessDays,
  easterSunday,
  isBusinessDay,
  nationalHolidays,
  toDateKey,
} from "./businessDays";

// Calendário de referência:
//   24/10/2026 sábado · 25/10 domingo · 26/10 segunda · 29/10 quinta · 30/10 sexta
//   02/11 segunda (Finados — feriado nacional) · 03/11 terça · 04/11 quarta
describe("dias úteis (BR)", () => {
  it("não conta sábado nem domingo", () => {
    expect(isBusinessDay("2026-10-24")).toBe(false);
    expect(isBusinessDay("2026-10-25")).toBe(false);
    expect(isBusinessDay("2026-10-26")).toBe(true);
  });

  it("não conta feriado nacional fixo", () => {
    expect(isBusinessDay("2026-01-01")).toBe(false); // Confraternização
    expect(isBusinessDay("2026-12-25")).toBe(false); // Natal
    expect(isBusinessDay("2026-04-21")).toBe(false); // Tiradentes
    expect(isBusinessDay("2026-11-02")).toBe(false); // Finados
  });

  it("não conta feriado nacional móvel (Carnaval, Sexta-feira Santa, Corpus Christi)", () => {
    // Páscoa 2026: 05/04/2026.
    expect(toDateKey(easterSunday(2026))).toBe("2026-04-05");
    expect(isBusinessDay("2026-02-17")).toBe(false); // terça de carnaval
    expect(isBusinessDay("2026-04-03")).toBe(false); // sexta-feira santa
    expect(isBusinessDay("2026-06-04")).toBe(false); // corpus christi
    expect(nationalHolidays(2026)).toContain("2026-04-03");
  });

  it("não conta feriado/suspensão do escritório", () => {
    const holidays = [{ date: "2026-10-28", name: "Suspensão forense" }];
    expect(isBusinessDay("2026-10-28", holidays)).toBe(false);
    expect(isBusinessDay("2026-10-28")).toBe(true);
  });

  it("soma dias úteis pulando fim de semana e feriado", () => {
    // 29/10 (qui) +1 útil = 30/10 (sex).
    expect(toDateKey(addBusinessDays("2026-10-29", 1))).toBe("2026-10-30");
    // +2 úteis = 03/11 (ter): 02/11 é Finados.
    expect(toDateKey(addBusinessDays("2026-10-29", 2))).toBe("2026-11-03");
    // 04/11 (qua) +1 = 05/11 (sex); +2 = 06/11 (seg).
    expect(toDateKey(addBusinessDays("2026-11-04", 1))).toBe("2026-11-05");
    expect(toDateKey(addBusinessDays("2026-11-04", 2))).toBe("2026-11-06");
  });

  it("soma dias úteis considerando feriado do escritório", () => {
    const holidays = [{ date: "2026-11-05", name: "Feriado municipal" }];
    // 04/11 (qua) +1 útil, pulando 05/11 (feriado) e o fim de semana → 06/11.
    expect(toDateKey(addBusinessDays("2026-11-04", 1, holidays))).toBe("2026-11-06");
  });

  it("conta dias úteis no intervalo (inclusivo)", () => {
    expect(countBusinessDays("2026-10-29", "2026-10-30")).toBe(2);
    expect(countBusinessDays("2026-10-26", "2026-10-30")).toBe(5);
    expect(countBusinessDays("2026-10-30", "2026-10-26")).toBe(0);
  });

  it("calcula dias úteis restantes e atraso", () => {
    // De 29/10 (qui) até 03/11 (ter): 30/10 e 03/11 = 2 dias úteis.
    expect(businessDaysUntil("2026-10-29", "2026-11-03")).toBe(2);
    // Prazo vencido: 27/10, 28/10 e 29/10 = 3 dias úteis de atraso.
    expect(businessDaysUntil("2026-10-29", "2026-10-27")).toBe(-3);
  });
});
