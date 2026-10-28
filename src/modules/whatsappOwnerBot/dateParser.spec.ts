import { describe, expect, it } from "vitest";
import { parseOwnerBotDate, parseOwnerBotTime, todayInSaoPaulo } from "./dateParser";

describe("parseOwnerBotDate", () => {
  const today = "2026-10-27";

  it("entende hoje, amanhã e depois de amanhã", () => {
    expect(parseOwnerBotDate("hoje", today)).toBe("2026-10-27");
    expect(parseOwnerBotDate("amanhã", today)).toBe("2026-10-28");
    expect(parseOwnerBotDate("depois de amanhã", today)).toBe("2026-10-29");
  });

  it("entende dd/mm e dd/mm/aaaa", () => {
    expect(parseOwnerBotDate("28/10", today)).toBe("2026-10-28");
    expect(parseOwnerBotDate("05/11/2027", today)).toBe("2027-11-05");
  });

  it("entende dia da semana (sempre a próxima ocorrência)", () => {
    // 2026-10-27 é uma terça-feira
    expect(parseOwnerBotDate("quinta", today)).toBe("2026-10-29");
    expect(parseOwnerBotDate("terça", today)).toBe("2026-11-03");
  });

  it("rejeita data inexistente", () => {
    expect(parseOwnerBotDate("31/02", today)).toBeNull();
  });

  it("rejeita texto sem data", () => {
    expect(parseOwnerBotDate("quero um café", today)).toBeNull();
  });
});

describe("parseOwnerBotTime", () => {
  it("entende os formatos mais comuns", () => {
    expect(parseOwnerBotTime("14:30")).toBe("14:30");
    expect(parseOwnerBotTime("14h30")).toBe("14:30");
    expect(parseOwnerBotTime("14h")).toBe("14:00");
    expect(parseOwnerBotTime("1430")).toBe("14:30");
    expect(parseOwnerBotTime("9")).toBe("09:00");
  });

  it("rejeita horário inválido", () => {
    expect(parseOwnerBotTime("25:00")).toBeNull();
    expect(parseOwnerBotTime("10:75")).toBeNull();
    expect(parseOwnerBotTime("amanhã")).toBeNull();
  });
});

describe("todayInSaoPaulo", () => {
  it("devolve o dia no formato ISO", () => {
    expect(todayInSaoPaulo(new Date("2026-10-27T23:30:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
