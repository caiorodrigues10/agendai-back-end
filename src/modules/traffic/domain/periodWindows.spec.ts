/// <reference types="vitest/globals" />
import { buildPeriodWindow, bucketStartForHour } from "./periodWindows";

describe("janelas civis do relatório de tráfego", () => {
  it("mantém as linhas horárias do dia corrente no bucket correspondente", () => {
    const window = buildPeriodWindow("day", new Date("2026-11-15T12:00:00.000Z"));

    expect(bucketStartForHour("2026-11-15T09", window.buckets)).toBe(
      "2026-11-15T09",
    );
    expect(bucketStartForHour("2026-11-15T12", window.buckets)).toBe(
      "2026-11-15T12",
    );
  });
});
