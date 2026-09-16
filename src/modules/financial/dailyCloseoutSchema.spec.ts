import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createCloseoutSchema, closeoutQuerySchema, closeoutRangeQuerySchema } from "./dailyCloseoutSchema";

describe("dailyCloseoutSchema", () => {
  describe("createCloseoutSchema", () => {
    it("accepts a valid date", () => {
      const result = createCloseoutSchema.parse({
        date: "2026-09-14",
        balanceOpen: 100,
      });
      expect(result.date).toBeInstanceOf(Date);
    });

    it("rejects missing date", () => {
      expect(() => createCloseoutSchema.parse({ balanceOpen: 100 })).toThrow(ZodError);
    });

    it("rejects invalid date string with structured error", () => {
      expect(() => createCloseoutSchema.parse({ date: "not-a-date" })).toThrow(ZodError);
      try {
        createCloseoutSchema.parse({ date: "not-a-date" });
      } catch (e) {
        const zodErr = e as ZodError;
        expect(zodErr.issues[0].message).toContain("Data inválida");
      }
    });
  });

  describe("closeoutQuerySchema", () => {
    it("accepts a valid date", () => {
      const result = closeoutQuerySchema.parse({ date: "2026-09-14" });
      expect(result.date).toBeInstanceOf(Date);
    });

    it("rejects invalid date string", () => {
      expect(() => closeoutQuerySchema.parse({ date: "garbage" })).toThrow(ZodError);
      try {
        closeoutQuerySchema.parse({ date: "garbage" });
      } catch (e) {
        const zodErr = e as ZodError;
        expect(zodErr.issues[0].message).toContain("Data inválida");
      }
    });
  });

  describe("closeoutRangeQuerySchema", () => {
    it("accepts valid date range", () => {
      const result = closeoutRangeQuerySchema.parse({
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      });
      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });

    it("rejects invalid startDate", () => {
      expect(() => closeoutRangeQuerySchema.parse({
        startDate: "bad",
        endDate: "2026-09-30",
      })).toThrow(ZodError);
    });

    it("rejects invalid endDate", () => {
      expect(() => closeoutRangeQuerySchema.parse({
        startDate: "2026-09-01",
        endDate: "bad",
      })).toThrow(ZodError);
    });
  });
});
