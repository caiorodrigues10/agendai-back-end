/// <reference types="vitest/globals" />
import { buildPeriodWindow, bucketStartForHour } from "./periodWindows";

const NOW = new Date("2026-11-15T12:00:00.000Z");

describe("janelas civis do relatório de tráfego", () => {
  it("mantém as linhas horárias do dia corrente no bucket correspondente", () => {
    const window = buildPeriodWindow("day", NOW);

    expect(bucketStartForHour("2026-11-15T09", window.buckets)).toBe(
      "2026-11-15T09",
    );
    expect(bucketStartForHour("2026-11-15T12", window.buckets)).toBe(
      "2026-11-15T12",
    );
  });

  it("preserva a janela do dia corrente quando não há âncora", () => {
    const window = buildPeriodWindow("day", NOW);

    expect(window).toMatchObject({
      granularity: "hour",
      fromDay: "2026-11-15",
      toDay: "2026-11-15",
      prevFromDay: "2026-11-14",
      prevToDay: "2026-11-14",
    });
    expect(window.buckets).toHaveLength(24);
    expect(window.buckets.filter((bucket) => bucket.partial)).toEqual([
      expect.objectContaining({ start: "2026-11-15T09" }),
    ]);
  });

  it("usa o dia histórico selecionado e compara com o dia anterior", () => {
    const window = buildPeriodWindow("day", NOW, {
      referenceDay: "2026-11-10",
    });

    expect(window).toMatchObject({
      granularity: "hour",
      fromDay: "2026-11-10",
      toDay: "2026-11-10",
      prevFromDay: "2026-11-09",
      prevToDay: "2026-11-09",
    });
    expect(window.buckets).toHaveLength(24);
    expect(window.buckets.every((bucket) => bucket.partial === false)).toBe(true);
  });

  it("mantém somente a hora corrente parcial quando o dia selecionado é hoje", () => {
    const window = buildPeriodWindow("day", NOW, {
      referenceDay: "2026-11-15",
    });

    expect(window.buckets.filter((bucket) => bucket.partial)).toEqual([
      expect.objectContaining({ start: "2026-11-15T09" }),
    ]);
  });

  it("preserva a janela do mês corrente quando não há âncora", () => {
    const window = buildPeriodWindow("month", NOW);

    expect(window).toMatchObject({
      granularity: "day",
      fromDay: "2026-11-01",
      toDay: "2026-11-15",
      prevFromDay: "2026-10-01",
      prevToDay: "2026-10-15",
    });
    expect(window.buckets).toHaveLength(15);
    expect(window.buckets.filter((bucket) => bucket.partial)).toEqual([
      expect.objectContaining({ start: "2026-11-15" }),
    ]);
  });

  it("usa o mês histórico completo e compara com o mês anterior completo", () => {
    const window = buildPeriodWindow("month", NOW, {
      referenceDay: "2026-10-01",
    });

    expect(window).toMatchObject({
      granularity: "day",
      fromDay: "2026-10-01",
      toDay: "2026-10-31",
      prevFromDay: "2026-09-01",
      prevToDay: "2026-09-30",
    });
    expect(window.buckets).toHaveLength(31);
    expect(window.buckets.every((bucket) => bucket.partial === false)).toBe(true);
  });

  it("mantém o mês corrente parcial quando ele é selecionado", () => {
    const window = buildPeriodWindow("month", NOW, {
      referenceDay: "2026-11-01",
    });

    expect(window).toMatchObject({
      fromDay: "2026-11-01",
      toDay: "2026-11-15",
      prevFromDay: "2026-10-01",
      prevToDay: "2026-10-15",
    });
    expect(window.buckets.filter((bucket) => bucket.partial)).toEqual([
      expect.objectContaining({ start: "2026-11-15" }),
    ]);
  });

  it("limita a comparação do mês corrente ao dia equivalente do mês anterior", () => {
    const window = buildPeriodWindow(
      "month",
      new Date("2026-03-31T12:00:00.000Z"),
      { referenceDay: "2026-03-01" },
    );

    expect(window).toMatchObject({
      fromDay: "2026-03-01",
      toDay: "2026-03-31",
      prevFromDay: "2026-02-01",
      prevToDay: "2026-02-28",
    });
  });

  it("ignora a âncora nos períodos que não suportam seleção histórica", () => {
    const withAnchor = buildPeriodWindow("week", NOW, {
      referenceDay: "2026-01-01",
    });
    const withoutAnchor = buildPeriodWindow("week", NOW);

    expect(withAnchor).toEqual(withoutAnchor);
  });
});
