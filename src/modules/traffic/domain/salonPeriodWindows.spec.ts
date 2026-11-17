/// <reference types="vitest/globals" />
import { buildSalonPeriodWindow, SALON_TRAFFIC_PERIOD_LABELS } from "./salonPeriodWindows";

/** 2026-11-15T12:00:00Z = 2026-11-15 09:00 em São Paulo (UTC-3). */
const NOW = new Date("2026-11-15T12:00:00.000Z");

describe("janelas móveis do relatório de tráfego do salão", () => {
  it("usa o dia civil de São Paulo (UTC-3), não o dia UTC", () => {
    // 2026-11-16T02:00Z = 2026-11-15 23:00 em São Paulo.
    const lateNight = new Date("2026-11-16T02:00:00.000Z");
    const window = buildSalonPeriodWindow("day", lateNight);

    expect(window.fromDay).toBe("2026-11-15");
    expect(window.toDay).toBe("2026-11-15");
    expect(window.buckets).toHaveLength(24);
    expect(window.buckets.filter((bucket) => bucket.partial)).toEqual([
      expect.objectContaining({ start: "2026-11-15T23" }),
    ]);
  });

  it("monta o dia com 24 buckets de hora e compara com o dia anterior", () => {
    const window = buildSalonPeriodWindow("day", NOW);

    expect(window).toMatchObject({
      key: "day",
      label: "Hoje",
      granularity: "hour",
      fromDay: "2026-11-15",
      toDay: "2026-11-15",
      prevFromDay: "2026-11-14",
      prevToDay: "2026-11-14",
    });
    expect(window.buckets).toHaveLength(24);
    expect(window.buckets[0]).toMatchObject({ start: "2026-11-15T00", label: "00:00" });
    expect(window.buckets[23]).toMatchObject({ start: "2026-11-15T23", label: "23:00" });
  });

  it("monta a semana como os últimos 7 dias (móvel, não semana-calendário)", () => {
    const window = buildSalonPeriodWindow("week", NOW);

    expect(window).toMatchObject({
      key: "week",
      label: "Últimos 7 dias",
      granularity: "day",
      fromDay: "2026-11-09",
      toDay: "2026-11-15",
      prevFromDay: "2026-11-02",
      prevToDay: "2026-11-08",
    });
    expect(window.buckets).toHaveLength(7);
    expect(window.buckets[0]).toMatchObject({ start: "2026-11-09" });
    expect(window.buckets[6]).toMatchObject({ start: "2026-11-15" });
  });

  it("monta o mês como os últimos 30 dias (móvel, não mês-calendário)", () => {
    const window = buildSalonPeriodWindow("month", NOW);

    expect(window).toMatchObject({
      key: "month",
      label: "Últimos 30 dias",
      granularity: "day",
      fromDay: "2026-10-17",
      toDay: "2026-11-15",
      prevFromDay: "2026-09-17",
      prevToDay: "2026-10-16",
    });
    expect(window.buckets).toHaveLength(30);
  });

  it("monta 3m como 90 dias em buckets de semana", () => {
    const window = buildSalonPeriodWindow("3m", NOW);

    expect(window).toMatchObject({
      key: "3m",
      label: "3 meses",
      granularity: "week",
      fromDay: "2026-08-18",
      toDay: "2026-11-15",
      prevFromDay: "2026-05-20",
      prevToDay: "2026-08-17",
    });
    expect(window.buckets.length).toBeGreaterThan(12);
    expect(window.buckets.length).toBeLessThanOrEqual(14);
  });

  it("monta 1 ano como 365 dias em buckets de mês", () => {
    const window = buildSalonPeriodWindow("year", NOW);

    expect(window).toMatchObject({
      key: "year",
      label: "1 ano",
      granularity: "month",
      fromDay: "2025-11-16",
      toDay: "2026-11-15",
      prevFromDay: "2024-11-16",
      prevToDay: "2025-11-15",
    });
    expect(window.buckets.length).toBeGreaterThanOrEqual(12);
    expect(window.buckets.length).toBeLessThanOrEqual(14);
  });

  it("marca apenas o bucket corrente como parcial nas janelas por dia", () => {
    const window = buildSalonPeriodWindow("week", NOW);

    expect(window.buckets.filter((bucket) => bucket.partial)).toEqual([
      expect.objectContaining({ start: "2026-11-15" }),
    ]);
  });

  it("mantém os rótulos pt-BR do contrato", () => {
    expect(SALON_TRAFFIC_PERIOD_LABELS).toEqual({
      day: "Hoje",
      week: "Últimos 7 dias",
      month: "Últimos 30 dias",
      "3m": "3 meses",
      year: "1 ano",
    });
  });
});
