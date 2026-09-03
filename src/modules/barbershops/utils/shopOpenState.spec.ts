import { describe, expect, it } from "vitest";
import { computeShopOpenState, type ComputeShopOpenStateInput } from "./shopOpenState";

const weekly = { isOpen: true, openTime: "09:00", closeTime: "18:00" };
const tz = "America/Sao_Paulo";

function base(overrides: Partial<ComputeShopOpenStateInput> = {}): ComputeShopOpenStateInput {
  return {
    now: new Date("2026-09-02T15:00:00-03:00"),
    timeZone: tz,
    manualStatus: "AUTO",
    manualStatusSetAt: null,
    openingMode: "SCHEDULE",
    queueClosedAt: null,
    weekly,
    exception: null,
    ...overrides,
  };
}

describe("computeShopOpenState", () => {
  it("segue a agenda semanal dentro do horário", () => {
    const state = computeShopOpenState(base());
    expect(state).toEqual({ open: true, reason: "SCHEDULE", queueClosed: false });
  });

  it("fecha fora do horário padrão", () => {
    const state = computeShopOpenState(base({ now: new Date("2026-09-02T21:00:00-03:00") }));
    expect(state.open).toBe(false);
    expect(state.reason).toBe("OUTSIDE_HOURS");
  });

  it("OPEN manual abre mesmo fora do horário, no mesmo dia", () => {
    const state = computeShopOpenState(
      base({
        now: new Date("2026-09-02T21:00:00-03:00"),
        manualStatus: "OPEN",
        manualStatusSetAt: new Date("2026-09-02T12:00:00-03:00"),
      })
    );
    expect(state).toMatchObject({ open: true, reason: "MANUAL_OPEN" });
  });

  it("OPEN manual expira no dia seguinte", () => {
    const state = computeShopOpenState(
      base({
        now: new Date("2026-09-03T10:00:00-03:00"),
        manualStatus: "OPEN",
        manualStatusSetAt: new Date("2026-09-02T21:00:00-03:00"),
        weekly,
      })
    );
    expect(state.reason).not.toBe("MANUAL_OPEN");
  });

  it("CLOSED manual persiste até reabrir", () => {
    const state = computeShopOpenState(
      base({
        now: new Date("2026-09-04T12:00:00-03:00"),
        manualStatus: "CLOSED",
        manualStatusSetAt: new Date("2026-09-02T10:00:00-03:00"),
      })
    );
    expect(state).toMatchObject({ open: false, reason: "MANUAL_CLOSED" });
  });

  it("modo MANUAL não abre sozinho", () => {
    const state = computeShopOpenState(base({ openingMode: "MANUAL" }));
    expect(state).toMatchObject({ open: false, reason: "MANUAL_MODE_NOT_OPENED" });
  });

  it("modo MANUAL + OPEN do dia abre", () => {
    const state = computeShopOpenState(
      base({
        openingMode: "MANUAL",
        manualStatus: "OPEN",
        manualStatusSetAt: new Date("2026-09-02T08:00:00-03:00"),
      })
    );
    expect(state).toMatchObject({ open: true, reason: "MANUAL_OPEN" });
  });

  it("exceção de calendário fecha o dia", () => {
    const state = computeShopOpenState(
      base({
        dateYmd: "2026-09-07",
        forDateOnly: true,
        exception: { isOpen: false },
      })
    );
    expect(state).toMatchObject({ open: false, reason: "EXCEPTION" });
  });

  it("override de hoje não fecha data futura", () => {
    const state = computeShopOpenState(
      base({
        dateYmd: "2026-09-10",
        forDateOnly: true,
        manualStatus: "CLOSED",
        manualStatusSetAt: new Date("2026-09-02T10:00:00-03:00"),
      })
    );
    expect(state.open).toBe(true);
    expect(state.reason).toBe("SCHEDULE");
  });

  it("fila fechada no mesmo dia não fecha o salão", () => {
    const state = computeShopOpenState(
      base({ queueClosedAt: new Date("2026-09-02T11:00:00-03:00") })
    );
    expect(state.open).toBe(true);
    expect(state.queueClosed).toBe(true);
  });

  it("fila fechada ontem já expirou", () => {
    const state = computeShopOpenState(
      base({ queueClosedAt: new Date("2026-09-01T18:00:00-03:00") })
    );
    expect(state.queueClosed).toBe(false);
  });
});
