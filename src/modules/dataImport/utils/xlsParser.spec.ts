import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseXls } from "./xlsParser";

/**
 * Fase 1 — Excel 97-2003 (.xls, OLE2/BIFF).
 *
 * O `.xls` é binário: a extensão e o mimetype não dizem nada sobre o
 * conteúdo. A detecção é pela assinatura OLE2 e a leitura é feita por um
 * leitor de planilha que **não executa nada** — só extrai os valores.
 */

const FIXTURES = join(__dirname, "fixtures");

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe("parseXls", () => {
  it("lê cabeçalho e linhas do arquivo de exemplo", async () => {
    const sheets = await parseXls(fixture("exemplo-clientes.xls"));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Clientes");
    expect(sheets[0].headers).toEqual(["Nome", "WhatsApp", "Valor", "Data"]);
    expect(sheets[0].rows).toHaveLength(3);
    expect(sheets[0].rows[0]).toEqual([
      "Ana Souza",
      "11987654321",
      "1.234,56",
      "01/02/2026",
    ]);
  });

  it("recusa um OLE2 que não é workbook (mensagem clara, sem stack)", async () => {
    await expect(parseXls(fixture("hostil-xls-invalido.xls"))).rejects.toThrow(
      /\.xls|Excel 97-2003/i,
    );
  });

  it("recusa .xls que declara um tamanho falso (8 GB em arquivo de 4 KB)", async () => {
    await expect(parseXls(fixture("hostil-xls-tamanho-falso.xls"))).rejects.toThrow(
      /tamanho maior do que o arquivo tem/i,
    );
  });

  it("lê as duas abas do arquivo de exemplo multi-aba", async () => {
    const sheets = await parseXls(fixture("exemplo-clientes-2abas.xls"));

    expect(sheets).toHaveLength(2);
    expect(sheets[0].name).toBe("Clientes");
    expect(sheets[1].name).toBe("Serviços");
    expect(sheets[1].headers).toEqual(["Serviço", "Preço", "Duração"]);
    expect(sheets[1].rows).toEqual([["Corte Teste", "50,00", "30"]]);
  });

  it("entrega a data em serial do Excel como número (a normalização converte)", async () => {
    const sheets = await parseXls(fixture("exemplo-data-serial.xls"));

    expect(sheets[0].rows).toEqual([
      ["Ana Souza", "45900"],
      ["Bruno Lima", "45901"],
    ]);
  });

  it("nunca entrega a fórmula: entra só o valor em cache", async () => {
    const sheets = await parseXls(fixture("exemplo-formula.xls"));

    expect(sheets[0].rows).toEqual([
      ["Ana Souza", "11987654321", "42"],
      ["Bruno Lima", "11988887777", "7"],
    ]);
    expect(JSON.stringify(sheets)).not.toMatch(/SUM|externo/i);
  });
});
