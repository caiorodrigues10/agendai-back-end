import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseXlsxSheets } from "./xlsxParser";
import { parseXls } from "./xlsParser";
import { parseOds } from "./odsParser";
import { normalizeDate } from "./rowNormalization";

/**
 * Fase 1 — a planilha que o dono manda no mundo real.
 *
 * Cada item da tabela de pendências tem um teste aqui:
 *   1. planilha com mais de uma aba;
 *   2. células mescladas (o valor não pode duplicar a linha);
 *   3. cabeçalho fora da 1ª linha (logo/período antes da tabela);
 *   4. linhas de total e rodapé no fim (não viram cliente);
 *   5. data em serial do Excel (o número vira data na normalização).
 */

const FIXTURES = join(__dirname, "fixtures");

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe("1. planilha com mais de uma aba", () => {
  it("XLS: lê as duas abas, cada uma com o seu cabeçalho", async () => {
    const sheets = await parseXls(fixture("exemplo-clientes-2abas.xls"));

    expect(sheets).toHaveLength(2);
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Clientes", "Serviços"]);
    expect(sheets[0].headers).toEqual(["Nome", "WhatsApp", "Valor", "Data"]);
    expect(sheets[1].headers).toEqual(["Serviço", "Preço", "Duração"]);
    expect(sheets[1].rows).toEqual([["Corte Teste", "50,00", "30"]]);
  });

  it("ODS: lê as duas abas, cada uma com o seu cabeçalho", async () => {
    const sheets = await parseOds(fixture("exemplo-clientes-2abas.ods"));

    expect(sheets).toHaveLength(2);
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Clientes", "Serviços"]);
    expect(sheets[1].headers).toEqual(["Serviço", "Preço"]);
    expect(sheets[1].rows).toEqual([["Corte Teste", "50,00"]]);
  });
});

describe("2. células mescladas", () => {
  it("XLSX: o valor mesclado não duplica a linha", async () => {
    const sheets = await parseXlsxSheets(fixture("exemplo-celulas-mescladas.xlsx"));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows).toEqual([
      ["Ana Souza", "11987654321", "1.234,56", "01/02/2026"],
      ["", "", "99,90", "05/03/2026"],
    ]);
    // Ana Souza aparece uma vez só: a linha mesclada não é duplicada.
    const nomes = sheets[0].rows.map((row) => row[0]).filter((nome) => nome);
    expect(nomes).toEqual(["Ana Souza"]);
  });

  it("ODS: a célula coberta da mescla não troca a coluna de lugar", async () => {
    const sheets = await parseOds(fixture("exemplo-celulas-mescladas.ods"));

    expect(sheets[0].headers).toEqual(["Nome", "WhatsApp", "Valor", "Data"]);
    expect(sheets[0].rows).toEqual([
      ["Ana Souza", "", "1.234,56", "01/02/2026"],
      ["Bruno Lima", "11988887777", "99,90", "05/03/2026"],
    ]);
  });
});

describe("3. cabeçalho fora da 1ª linha", () => {
  it("usa a linha do cabeçalho e descarta a capa", async () => {
    const sheets = await parseXlsxSheets(fixture("hostil-cabecalho-2a-linha.xlsx"));

    expect(sheets[0].headers).toEqual(["Nome", "WhatsApp", "Valor", "Data"]);
    expect(sheets[0].rows).toHaveLength(3);
    expect(sheets[0].rows[0]).toEqual([
      "Ana Souza",
      "11987654321",
      "1.234,56",
      "01/02/2026",
    ]);
  });
});

describe("4. linhas de total e rodapé", () => {
  it("descarta TOTAL e o rodapé sem virar cliente", async () => {
    const sheets = await parseXlsxSheets(fixture("hostil-linha-de-total.xlsx"));

    expect(sheets[0].rows).toHaveLength(3);
    const nomes = sheets[0].rows.map((row) => row[0]);
    expect(nomes).not.toContain("TOTAL");
    expect(nomes.some((nome) => nome.startsWith("Gerado em"))).toBe(false);
  });
});

describe("5. data em serial do Excel", () => {
  it("o .xls entrega o número cru", async () => {
    const sheets = await parseXls(fixture("exemplo-data-serial.xls"));

    expect(sheets[0].rows[0][1]).toBe("45900");
    expect(sheets[0].rows[1][1]).toBe("45901");
  });

  it("a normalização converte o serial em data", () => {
    // O Excel conta os dias a partir de 30/12/1899 (o bug do 1900):
    //   45900 dias depois de 30/12/1899 = 31/08/2025
    //   45901 dias depois de 30/12/1899 = 01/09/2025
    const epoch = Date.UTC(1899, 11, 30);
    const dia = (serial: number) =>
      new Date(epoch + Math.round(serial * 86_400_000)).toISOString().slice(0, 10);

    expect(dia(45900)).toBe("2025-08-31");
    expect(dia(45901)).toBe("2025-09-01");

    expect(normalizeDate("45900")).toBe("2025-08-31");
    expect(normalizeDate("45901")).toBe("2025-09-01");
  });
});
