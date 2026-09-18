/// <reference types="vitest/globals" />
import { ZodError } from "zod";
import { cashMovementQuerySchema, cashSummaryQuerySchema, createCashMovementSchema } from "./cashMovementSchema";

describe("cashMovementSchema", () => {
  describe("cashMovementQuerySchema", () => {
    it("accepts a valid YYYY-MM-DD date", () => {
      const result = cashMovementQuerySchema.parse({ date: "2026-09-14" });
      expect(result.date).toBeInstanceOf(Date);
    });

    it("accepts empty date (optional)", () => {
      const result = cashMovementQuerySchema.parse({});
      expect(result.date).toBeUndefined();
    });

    it("rejects explicitly invalid date string with structured error", () => {
      expect(() => cashMovementQuerySchema.parse({ date: "not-a-date" })).toThrow(ZodError);
      try {
        cashMovementQuerySchema.parse({ date: "not-a-date" });
      } catch (e) {
        const zodErr = e as ZodError;
        expect(zodErr.issues[0].message).toContain("Data inválida");
      }
    });

    it("rejects invalid month (2026-13-01) with structured error", () => {
      expect(() => cashMovementQuerySchema.parse({ date: "2026-13-01" })).toThrow(ZodError);
    });
  });

  describe("cashSummaryQuerySchema", () => {
    it("defaults to today when no date provided", () => {
      const result = cashSummaryQuerySchema.parse({});
      expect(result.date).toBeInstanceOf(Date);
      const today = new Date();
      expect(result.date.getFullYear()).toBe(today.getFullYear());
      expect(result.date.getMonth()).toBe(today.getMonth());
      expect(result.date.getDate()).toBe(today.getDate());
    });

    it("accepts a valid date", () => {
      const result = cashSummaryQuerySchema.parse({ date: "2026-01-15" });
      expect(result.date).toBeInstanceOf(Date);
    });

    it("rejects explicitly invalid date string with structured error", () => {
      expect(() => cashSummaryQuerySchema.parse({ date: "garbage" })).toThrow(ZodError);
      try {
        cashSummaryQuerySchema.parse({ date: "garbage" });
      } catch (e) {
        const zodErr = e as ZodError;
        expect(zodErr.issues[0].message).toContain("Data inválida");
      }
    });
  });

  describe("createCashMovementSchema", () => {
    it("accepts positive amount", () => {
      const result = createCashMovementSchema.parse({
        type: "SERVICE_SALE",
        amount: 100,
        paymentMethod: "CASH",
      });
      expect(result.amount).toBe(100);
    });

    it("rejects zero or negative amount", () => {
      expect(() =>
        createCashMovementSchema.parse({
          type: "SERVICE_SALE",
          amount: 0,
          paymentMethod: "CASH",
        }),
      ).toThrow(ZodError);
      expect(() =>
        createCashMovementSchema.parse({
          type: "WITHDRAWAL",
          amount: -10,
          paymentMethod: "CASH",
        }),
      ).toThrow(ZodError);
    });
  });
});
