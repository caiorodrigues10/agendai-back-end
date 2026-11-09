/**
 * Testes da métrica do benchmark do OCR.
 *
 * A métrica é o que decide se uma etapa do pré-processamento entra no
 * caminho: acerto exato, acerto normalizado e falso confiante (valor
 * errado que mesmo assim passa nos normalizadores de produção).
 */
import { describe, it, expect } from "vitest";
import {
  avaliarImagem,
  consolidar,
  passaNoNormalizador,
  igualAfterNormalizador,
} from "./ocrMetricas";
import type { OcrSheetResult } from "./ocr.types";

const GROUND_TRUTH = {
  nome: "clientes-larga.png",
  larguraPx: 1200,
  titulo: "Clientes",
  cabecalhos: ["Nome", "Telefone", "Valor"],
  colunas: [
    { indice: 0, campo: "nome" as const },
    { indice: 1, campo: "telefone" as const },
    { indice: 2, campo: "valor" as const },
  ],
  linhas: [["Ana Souza", "11987654321", "120,00"]],
};

/** Resultado de OCR falso, com as células informadas. */
function resultadoFake(
  celulas: Array<{ valor: string; confianca: number; coluna: number }>,
): OcrSheetResult {
  return {
    headers: ["Coluna 1", "Coluna 2", "Coluna 3"],
    celulas: [
      celulas.map((celula, indice) => ({
        valor: celula.valor,
        confianca: celula.confianca,
        origem: "ocr" as const,
        linha: 1,
        coluna: celula.coluna ?? indice,
      })),
    ],
    sheet: {
      headers: ["Coluna 1", "Coluna 2", "Coluna 3"],
      rows: [],
      sheetNames: [],
      selectedSheet: null,
    },
    larguraTabelaPx: 800,
    larguraImagemPx: 1000,
  };
}

describe("métricas do benchmark", () => {
  it("um telefone errado que passa no normalizador é falso confiante", () => {
    const metrica = avaliarImagem(
      "t1",
      "clientes-larga.png",
      "original",
      resultadoFake([
        { valor: "Ana Souza", confianca: 95, coluna: 0 },
        { valor: "11987654322", confianca: 91, coluna: 1 },
        { valor: "120,00", confianca: 95, coluna: 2 },
      ]),
      GROUND_TRUTH,
    );
    const telefone = metrica.campos.get("telefone")!;
    expect(telefone.acertoExato).toBe(0);
    expect(telefone.falsoConfiante).toBe(1);
    expect(telefone.erroComum).toBe(0);
  });

  it("o mesmo telefone errado com confiança baixa não é falso confiante", () => {
    const metrica = avaliarImagem(
      "t2",
      "clientes-larga.png",
      "original",
      resultadoFake([
        { valor: "Ana Souza", confianca: 95, coluna: 0 },
        { valor: "11987654322", confianca: 40, coluna: 1 },
        { valor: "120,00", confianca: 95, coluna: 2 },
      ]),
      GROUND_TRUTH,
    );
    const telefone = metrica.campos.get("telefone")!;
    expect(telefone.falsoConfiante).toBe(0);
    expect(telefone.erroComum).toBe(1);
  });

  it("o valor lido exatamente é acerto exato", () => {
    const metrica = avaliarImagem(
      "t3",
      "clientes-larga.png",
      "original",
      resultadoFake([
        { valor: "Ana Souza", confianca: 95, coluna: 0 },
        { valor: "11987654321", confianca: 91, coluna: 1 },
        { valor: "120,00", confianca: 95, coluna: 2 },
      ]),
      GROUND_TRUTH,
    );
    expect(metrica.campos.get("nome")!.acertoExato).toBe(1);
    expect(metrica.campos.get("telefone")!.acertoExato).toBe(1);
    expect(metrica.campos.get("valor")!.acertoExato).toBe(1);
    expect(metrica.campos.get("valor")!.falsoConfiante).toBe(0);
  });

  it("o total consolida as células de todas as imagens", () => {
    const metrica = avaliarImagem(
      "t4",
      "clientes-larga.png",
      "original",
      resultadoFake([
        { valor: "Ana Souza", confianca: 95, coluna: 0 },
        { valor: "11987654321", confianca: 91, coluna: 1 },
        { valor: "120,00", confianca: 95, coluna: 2 },
      ]),
      GROUND_TRUTH,
    );
    const total = consolidar("teste", [metrica]);
    expect(total.total).toBe(3);
    expect(total.acertoExato).toBe(3);
    expect(total.falsoConfiante).toBe(0);
    expect(total.confiancaMedia).toBeCloseTo((95 + 91 + 95) / 3, 5);
  });

  it("o normalizador de produção decide o que é falso confiante", () => {
    expect(passaNoNormalizador("telefone", "11987654321")).toBe(true);
    expect(passaNoNormalizador("telefone", "119")).toBe(false);
    expect(passaNoNormalizador("valor", "120,00")).toBe(true);
    expect(passaNoNormalizador("valor", "abc")).toBe(false);
    expect(igualAfterNormalizador("telefone", "11 98765-4321", "11987654321")).toBe(true);
    expect(igualAfterNormalizador("valor", "120.00", "120,00")).toBe(true);
  });
});
