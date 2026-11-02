import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectImportFormat } from "./formatDetector";

/**
 * Fase 1 — a detecção do formato é feita pelo **conteúdo** (magic bytes),
 * nunca pela extensão nem pelo mimetype. Um `.xlsx` que é na verdade um CSV
 * é lido como CSV; um `.csv` que é na verdade um XLSX é lido como XLSX.
 */

const FIXTURES = join(__dirname, "fixtures");

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe("detectImportFormat — detecção por conteúdo", () => {
  it("reconhece xlsx pelo ZIP com xl/workbook.xml", () => {
    expect(detectImportFormat(fixture("exemplo-clientes.xlsx"))).toBe("XLSX");
  });

  it("reconhece xlsm (macro presente) e nunca executa a macro", () => {
    expect(detectImportFormat(fixture("exemplo-clientes.xlsm"))).toBe("XLSM");
    expect(detectImportFormat(fixture("hostil-macro.xlsm"))).toBe("XLSM");
  });

  it("reconhece ods pelo mimetype interno do OpenDocument", () => {
    expect(detectImportFormat(fixture("exemplo-clientes.ods"))).toBe("ODS");
  });

  it("reconhece xls pela assinatura OLE2", () => {
    expect(detectImportFormat(fixture("exemplo-clientes.xls"))).toBe("XLS");
  });

  it("reconhece pdf pela assinatura %PDF-", () => {
    expect(detectImportFormat(fixture("exemplo-clientes.pdf"))).toBe("PDF");
  });

  it("reconhece texto delimitado (tsv e txt)", () => {
    expect(detectImportFormat(fixture("exemplo-clientes.tsv"))).toBe("CSV");
    expect(detectImportFormat(fixture("exemplo-clientes.txt"))).toBe("CSV");
  });

  it("recusa binário disfarçado de texto", () => {
    expect(() => detectImportFormat(fixture("hostil-binario.tsv"))).toThrow(/texto/i);
  });

  it("recusa imagem (Fase 2 ainda não extrai tabela de imagem)", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);
    expect(() => detectImportFormat(png)).toThrow(/imagem/i);
  });

  it("recusa PDF sem texto? (a detecção só olha a assinatura)", () => {
    // O PDF sem texto é detectado como PDF; quem recusa é o parser, que não
    // encontra texto selecionável.
    expect(detectImportFormat(fixture("hostil-pdf-sem-texto.pdf"))).toBe("PDF");
  });

  it("recusa ZIP que não é planilha", () => {
    const zip = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    ]);
    expect(() => detectImportFormat(zip)).toThrow();
  });

  it("recusa arquivo vazio", () => {
    expect(() => detectImportFormat(Buffer.alloc(0))).toThrow(/vazio/i);
  });
});
