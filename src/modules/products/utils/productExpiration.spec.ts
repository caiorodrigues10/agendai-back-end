import { describe, it, expect } from "vitest";
import {
  EXPIRING_SOON_DAYS,
  supportsExpiration,
  ymdInTimeZone,
  getShopToday,
  getExpirationStatus,
  expirationWhere,
} from "./productExpiration";

describe("supportsExpiration", () => {
  it("returns true for CONSUMABLE and BOTH", () => {
    expect(supportsExpiration("CONSUMABLE")).toBe(true);
    expect(supportsExpiration("BOTH")).toBe(true);
  });

  it("returns false for RETAIL", () => {
    expect(supportsExpiration("RETAIL")).toBe(false);
  });
});

describe("EXPIRING_SOON_DAYS", () => {
  it("is 30", () => {
    expect(EXPIRING_SOON_DAYS).toBe(30);
  });
});

describe("ymdInTimeZone", () => {
  it("returns YYYY-MM-DD in America/Sao_Paulo", () => {
    // 2026-10-01T01:00Z is still 2026-09-30 in America/Sao_Paulo (UTC-3)
    const date = new Date("2026-10-01T01:00:00Z");
    expect(ymdInTimeZone(date, "America/Sao_Paulo")).toBe("2026-09-30");
  });

  it("handles midnight in Sao Paulo", () => {
    // 2026-01-01T03:00Z = 2026-01-01T00:00 in UTC-3
    const date = new Date("2026-01-01T03:00:00Z");
    expect(ymdInTimeZone(date, "America/Sao_Paulo")).toBe("2026-01-01");
  });

  it("handles UTC timezone", () => {
    const date = new Date("2026-06-15T12:00:00Z");
    expect(ymdInTimeZone(date, "UTC")).toBe("2026-06-15");
  });
});

describe("getShopToday", () => {
  it("returns a YYYY-MM-DD string", () => {
    const today = getShopToday("America/Sao_Paulo");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("defaults to America/Sao_Paulo", () => {
    const today = getShopToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getExpirationStatus", () => {
  it("returns null when expirationDate is null", () => {
    expect(getExpirationStatus(null, "2026-10-01")).toBeNull();
  });

  it("returns null when expirationDate is undefined", () => {
    expect(getExpirationStatus(undefined, "2026-10-01")).toBeNull();
  });

  it("returns 'expired' when expirationDate < today", () => {
    expect(getExpirationStatus("2026-09-30", "2026-10-01")).toBe("expired");
  });

  it("returns 'expired' when expirationDate = yesterday", () => {
    expect(getExpirationStatus("2026-09-29", "2026-09-30")).toBe("expired");
  });

  it("returns 'expiring' when expirationDate = today", () => {
    expect(getExpirationStatus("2026-10-01", "2026-10-01")).toBe("expiring");
  });

  it("returns 'expiring' when expirationDate = today + 30 (default)", () => {
    expect(getExpirationStatus("2026-10-31", "2026-10-01")).toBe("expiring");
  });

  it("returns null when expirationDate = today + 31 (beyond default window)", () => {
    expect(getExpirationStatus("2026-11-01", "2026-10-01")).toBeNull();
  });

  it("respects custom days parameter", () => {
    expect(getExpirationStatus("2026-10-08", "2026-10-01", 7)).toBe("expiring");
    expect(getExpirationStatus("2026-10-09", "2026-10-01", 7)).toBeNull();
  });

  it("handles Date objects (midnight UTC = same day in UTC)", () => {
    // Prisma @db.Date returns Date objects at midnight UTC.
    // toISOString().slice(0,10) gives the UTC date — no timezone conversion.
    const expDate = new Date("2026-10-01T00:00:00Z");
    expect(getExpirationStatus(expDate, "2026-10-01")).toBe("expiring");
  });

  it("handles Date objects — regression: expired", () => {
    const expDate = new Date("2026-09-30T00:00:00Z");
    expect(getExpirationStatus(expDate, "2026-10-01")).toBe("expired");
  });

  it("handles Date objects — regression: expiring (today + 30)", () => {
    const expDate = new Date("2026-10-31T00:00:00Z");
    expect(getExpirationStatus(expDate, "2026-10-01")).toBe("expiring");
  });

  it("handles Date objects — regression: null (today + 31)", () => {
    const expDate = new Date("2026-11-01T00:00:00Z");
    expect(getExpirationStatus(expDate, "2026-10-01")).toBeNull();
  });

  it("handles ISO strings with time component", () => {
    expect(getExpirationStatus("2026-09-30T23:59:59Z", "2026-10-01")).toBe("expired");
  });

  it("returns null for invalid/empty string", () => {
    expect(getExpirationStatus("", "2026-10-01")).toBeNull();
    expect(getExpirationStatus("invalid", "2026-10-01")).toBeNull();
  });
});

describe("expirationWhere", () => {
  it("builds correct filter for expired", () => {
    const where = expirationWhere("expired", "2026-10-01");
    expect(where).toEqual({
      active: true,
      trackStock: true,
      stockQty: { gt: 0 },
      type: { in: ["CONSUMABLE", "BOTH"] },
      expirationDate: { lt: new Date("2026-10-01") },
    });
  });

  it("builds correct filter for expiring", () => {
    const where = expirationWhere("expiring", "2026-10-01");
    expect(where.active).toBe(true);
    expect(where.trackStock).toBe(true);
    expect((where.stockQty as any).gt).toBe(0);
    expect(where.type).toEqual({ in: ["CONSUMABLE", "BOTH"] });
    expect((where.expirationDate as any).gte).toBeDefined();
    expect((where.expirationDate as any).lte).toBeDefined();
  });

  it("uses custom days for expiring window", () => {
    const where = expirationWhere("expiring", "2026-10-01", 7);
    const upper = (where.expirationDate as any).lte;
    expect(upper.toISOString().slice(0, 10)).toBe("2026-10-08");
  });
});
