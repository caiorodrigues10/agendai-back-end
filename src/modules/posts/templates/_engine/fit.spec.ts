import { describe, expect, it } from "vitest";
import { estimateTitleH, fitFooter, fitName, fitPills, fitPrice } from "./fit";

const GAP = 14;
const NOTE_H = 34;

function pillBlockHeight(count: number, fit: { visibleCount: number; hiddenCount: number; rowHeight: number }): number {
  return fit.visibleCount * (fit.rowHeight + GAP) + (fit.hiddenCount > 0 ? NOTE_H : 0);
}

describe("fitPills (sem altura disponível — comportamento clássico)", () => {
  it("1–6 itens → linha alta 84/30, tudo visível", () => {
    expect(fitPills(5)).toEqual({ visibleCount: 5, hiddenCount: 0, rowHeight: 84, fontSize: 30 });
  });
  it("7–8 itens → linha 68/26, tudo visível", () => {
    expect(fitPills(8)).toEqual({ visibleCount: 8, hiddenCount: 0, rowHeight: 68, fontSize: 26 });
  });
  it(">8 itens → corta em 8 e avisa", () => {
    expect(fitPills(10)).toEqual({ visibleCount: 8, hiddenCount: 2, rowHeight: 68, fontSize: 26 });
  });
});

describe("fitPills (com availableH — nunca estoura o rodapé)", () => {
  it("comprime altura/fonte antes de esconder linhas", () => {
    const fit = fitPills(8, 655);
    expect(fit.visibleCount).toBe(8);
    expect(fit.hiddenCount).toBe(0);
    expect(pillBlockHeight(8, fit)).toBeLessThanOrEqual(655);
  });

  it("não sobrepõe o rodapé: bloco sempre cabe no espaço dado", () => {
    for (const count of [1, 4, 6, 7, 8, 10, 12]) {
      for (let availableH = 100; availableH <= 900; availableH += 50) {
        const fit = fitPills(count, availableH);
        expect(fit.visibleCount).toBeGreaterThanOrEqual(1);
        expect(fit.hiddenCount).toBe(count - fit.visibleCount);
        expect(pillBlockHeight(count, fit)).toBeLessThanOrEqual(availableH);
      }
    }
  });

  it("só esconde quando nem o tier mínimo cabe", () => {
    const fit = fitPills(8, 300);
    expect(fit.visibleCount).toBeLessThan(8);
    expect(fit.hiddenCount).toBeGreaterThan(0);
    expect(pillBlockHeight(8, fit)).toBeLessThanOrEqual(300);
  });

  it("mantém no mínimo 1 pílula mesmo no espaço apertado", () => {
    expect(fitPills(6, 100).visibleCount).toBe(1);
  });
});

describe("estimateTitleH", () => {
  it("cresce com o nº de linhas e nunca é negativa", () => {
    const short = estimateTitleH("TABELA", "VALORES", { columnW: 504, firstSize: 64, lastSize: 100 });
    const long = estimateTitleH("TABELA DE VALORES COMPLETA DOS NOSSOS", "SERVIÇOS", {
      columnW: 504,
      firstSize: 64,
      lastSize: 100,
    });
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeGreaterThanOrEqual(2 * 64 + 95 + 4 + 40);
  });
});

describe("fitFooter", () => {
  it("nome curto → tamanhos de base (40/52)", () => {
    const f = fitFooter("Barbearia", "da Rua", "WhatsApp · (11) 99999-8888  ·  @barbeariadarua", 504);
    expect(f.firstSize).toBe(40);
    expect(f.restSize).toBe(52);
    expect(f.height).toBeGreaterThan(0);
  });

  it("nome longo encolhe p/ caber na coluna (nunca estoura)", () => {
    const f = fitFooter("Estúdio", "de Beleza e Sobrancelhas São João Batista", "", 552);
    expect(f.firstSize).toBeLessThanOrEqual(40);
    expect(f.restSize).toBeGreaterThanOrEqual(26);
    expect(f.restSize).toBeLessThan(52);
    // altura cobre a quebra em 2 linhas estimada pelo fit
    expect(f.height).toBeGreaterThanOrEqual(f.firstSize + 2 * f.restSize);
  });

  it("coluna estreita pior caso → size mínimo e altura realista", () => {
    const f = fitFooter("Estúdio", "de Beleza e Sobrancelhas São João Batista", "WhatsApp · (11) 99999-8888  ·  @estudio.saojoao", 504);
    expect(f.firstSize).toBeGreaterThanOrEqual(26);
    expect(f.restSize).toBeGreaterThanOrEqual(26);
    expect(f.height).toBeGreaterThan(0);
  });
});

describe("fitName / fitPrice (regressão)", () => {
  it("fitName só corta quando passa do limite", () => {
    expect(fitName("Corte na tesoura", 50)).toBe("Corte na tesoura");
    expect(fitName("Design de sobrancelhas com pigmentação", 10)).toBe("Design de…");
  });
  it("fitPrice nunca quebra (pt-BR com NBSP do Intl)", () => {
    expect(fitPrice(45)).toBe("R$\u00A045,00");
    expect(fitPrice(null)).toBe("sob consulta");
    expect(fitPrice(150, { from: true })).toBe("a partir de R$\u00A0150,00");
  });
});
