/**
 * Unit — cálculo de períodos da exportação.
 *
 * Cobre as regras que o dono vê na tela: dia no fuso do salão, semana de
 * domingo a sábado, mês até hoje, janelas móveis com meses curtos, período
 * personalizado limitado e o comparativo com o período anterior.
 */
import { describe, it, expect } from "vitest";
import {
  resolveExportPeriod,
  previousExportPeriod,
  periodRange,
} from "./exportPeriod";

const TZ = "America/Sao_Paulo";

/** 2026-10-30 15:00 no fuso de São Paulo (18:00 UTC). */
const NOW = new Date("2026-10-30T18:00:00Z");

function keyBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: TZ });
}

describe("resolveExportPeriod", () => {
  it("hoje é o dia inteiro no fuso do salão", () => {
    const period = resolveExportPeriod("TODAY", TZ, NOW);
    expect(keyBR(period.from!)).toBe("30/10/2026");
    expect(keyBR(period.to!)).toBe("30/10/2026");
    expect(period.label).toContain("30/10/2026");
  });

  it("esta semana é de domingo a sábado (cortando em hoje)", () => {
    const period = resolveExportPeriod("THIS_WEEK", TZ, NOW);
    // 30/10/2026 é uma sexta: a semana começa no domingo 25/10 e vai até hoje
    // (mesma leitura do relatório do app, que mostra a semana em andamento).
    expect(keyBR(period.from!)).toBe("25/10/2026");
    expect(keyBR(period.to!)).toBe("30/10/2026");
  });

  it("este mês vai do dia 1 até hoje", () => {
    const period = resolveExportPeriod("THIS_MONTH", TZ, NOW);
    expect(keyBR(period.from!)).toBe("01/10/2026");
    expect(keyBR(period.to!)).toBe("30/10/2026");
  });

  it("últimos 3 meses é janela móvel no mesmo dia do mês anterior", () => {
    const period = resolveExportPeriod("LAST_3_MONTHS", TZ, NOW);
    expect(keyBR(period.from!)).toBe("30/07/2026");
    expect(keyBR(period.to!)).toBe("30/10/2026");
  });

  it("últimos 6 e 12 meses também são janelas móveis", () => {
    expect(keyBR(resolveExportPeriod("LAST_6_MONTHS", TZ, NOW).from!)).toBe("30/04/2026");
    expect(keyBR(resolveExportPeriod("LAST_12_MONTHS", TZ, NOW).from!)).toBe("30/10/2025");
  });

  it("trata meses curtos (31 de janeiro)", () => {
    const january = new Date("2026-01-31T18:00:00Z");
    const period = resolveExportPeriod("LAST_3_MONTHS", TZ, january);
    // 31/01 - 3 meses = 31/10 do ano anterior (o diajs ajusta meses curtos).
    expect(keyBR(period.from!)).toBe("31/10/2025");
  });

  it("tudo não filtra por data", () => {
    const period = resolveExportPeriod("ALL", TZ, NOW);
    expect(period.from).toBeNull();
    expect(period.to).toBeNull();
    expect(periodRange(period)).toEqual({});
  });

  it("personalizado aceita datas no fuso do salão", () => {
    const period = resolveExportPeriod("CUSTOM", TZ, NOW, "2026-02-01", "2026-02-28");
    expect(keyBR(period.from!)).toBe("01/02/2026");
    expect(keyBR(period.to!)).toBe("28/02/2026");
  });

  it("personalizado recusa data invertida e data futura", () => {
    expect(() => resolveExportPeriod("CUSTOM", TZ, NOW, "2026-03-01", "2026-02-01")).toThrow(
      /posterior/i,
    );
    expect(() => resolveExportPeriod("CUSTOM", TZ, NOW, "2026-01-01", "2026-12-31")).toThrow(
      /posterior a hoje/i,
    );
  });

  it("personalizado recusa janela maior que 24 meses", () => {
    expect(() =>
      resolveExportPeriod("CUSTOM", TZ, NOW, "2024-01-01", "2026-10-01"),
    ).toThrow(/24 meses/i);
  });

  it("respeita o fuso do salão (dia já virado no Brasil)", () => {
    // 2026-10-30 02:00 UTC = 29/10 no fuso de São Paulo (UTC-3).
    const period = resolveExportPeriod("TODAY", TZ, new Date("2026-10-30T02:00:00Z"));
    expect(keyBR(period.from!)).toBe("29/10/2026");
  });
});

describe("previousExportPeriod", () => {
  it("compara hoje com ontem", () => {
    const period = resolveExportPeriod("TODAY", TZ, NOW);
    const previous = previousExportPeriod(period)!;
    expect(keyBR(previous.from!)).toBe("29/10/2026");
    expect(keyBR(previous.to!)).toBe("29/10/2026");
  });

  it("compara esta semana com a anterior", () => {
    const period = resolveExportPeriod("THIS_WEEK", TZ, NOW);
    const previous = previousExportPeriod(period)!;
    expect(keyBR(previous.from!)).toBe("18/10/2026");
    expect(keyBR(previous.to!)).toBe("24/10/2026");
  });

  it("compara este mês com o mês anterior", () => {
    const period = resolveExportPeriod("THIS_MONTH", TZ, NOW);
    const previous = previousExportPeriod(period)!;
    expect(keyBR(previous.from!)).toBe("01/09/2026");
    expect(keyBR(previous.to!)).toBe("30/09/2026");
  });

  it("não tem período anterior para 'tudo'", () => {
    expect(previousExportPeriod(resolveExportPeriod("ALL", TZ, NOW))).toBeNull();
  });
});
