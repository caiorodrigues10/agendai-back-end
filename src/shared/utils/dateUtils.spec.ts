import { describe, it, expect } from "vitest";
import {
  isValidDate,
  isNotPast,
  isWithinHorizon,
  isValidTime,
  isBusinessHour,
  addMinutes,
  timesOverlap,
} from "./dateUtils";

describe("dateUtils", () => {
  describe("isValidDate", () => {
    it("aceita data válida", () => {
      expect(isValidDate("2026-08-06")).toBe(true);
    });

    it("aceita 29/02 em ano bissexto", () => {
      expect(isValidDate("2024-02-29")).toBe(true);
    });

    it("rejeita 29/02 em ano não bissexto", () => {
      expect(isValidDate("2025-02-29")).toBe(false);
    });

    it("rejeita 31/04 (abril tem 30 dias)", () => {
      expect(isValidDate("2026-04-31")).toBe(false);
    });

    it("rejeita formato inválido", () => {
      expect(isValidDate("06/08/2026")).toBe(false);
      expect(isValidDate("2026-8-6")).toBe(false);
      expect(isValidDate("abc")).toBe(false);
    });
  });

  describe("isNotPast", () => {
    it("aceita data futura", () => {
      expect(isNotPast("2099-12-31")).toBe(true);
    });

    it("rejeita ano 0001", () => {
      expect(isNotPast("0001-01-01")).toBe(false);
    });
  });

  describe("isWithinHorizon", () => {
    it("aceita data dentro do horizonte", () => {
      expect(isWithinHorizon("2026-08-10")).toBe(true);
    });

    it("rejeita data muito distante", () => {
      expect(isWithinHorizon("2099-12-31")).toBe(false);
    });
  });

  describe("isValidTime", () => {
    it("aceita horário válido", () => {
      expect(isValidTime("08:30")).toBe(true);
      expect(isValidTime("00:00")).toBe(true);
      expect(isValidTime("23:59")).toBe(true);
    });

    it("rejeita horário inválido", () => {
      expect(isValidTime("25:00")).toBe(false);
      expect(isValidTime("12:60")).toBe(false);
      expect(isValidTime("abc")).toBe(false);
    });
  });

  describe("isBusinessHour", () => {
    it("aceita horário comercial", () => {
      expect(isBusinessHour("07:00")).toBe(true);
      expect(isBusinessHour("12:00")).toBe(true);
      expect(isBusinessHour("22:00")).toBe(true);
    });

    it("rejeita antes do comercial", () => {
      expect(isBusinessHour("06:59")).toBe(false);
    });

    it("rejeita depois do comercial", () => {
      expect(isBusinessHour("22:01")).toBe(false);
    });
  });

  describe("addMinutes", () => {
    it("soma minutos normalmente", () => {
      expect(addMinutes("08:30", 90)).toBe("10:00");
    });

    it("crossover de hora", () => {
      expect(addMinutes("23:30", 60)).toBe("00:30");
    });

    it("zero minutos", () => {
      expect(addMinutes("14:00", 0)).toBe("14:00");
    });
  });

  describe("timesOverlap", () => {
    it("detecta sobreposição", () => {
      expect(timesOverlap("08:00", "09:00", "08:30", "09:30")).toBe(true);
    });

    it("detecta sem sobreposição", () => {
      expect(timesOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
    });

    it("intervalo contido", () => {
      expect(timesOverlap("08:00", "10:00", "08:30", "09:30")).toBe(true);
    });
  });
});
