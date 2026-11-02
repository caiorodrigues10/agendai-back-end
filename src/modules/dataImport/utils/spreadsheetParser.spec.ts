import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectImportFormat } from "./formatDetector";
import { readSpreadsheetSheets } from "./spreadsheetParser";
import type { ImportFileFormat } from "../dataImport.types";

/**
 * Fase 1 — a leitura segue o formato **detectado pelo conteúdo**.
 *
 * Cada formato novo tem um arquivo de exemplo e um caso hostil. O teste
 * percorre o caminho real do produto: detectar → gravar em disco → ler as
 * abas. É o que prova que o formato não é só detectado, mas lido.
 */

const FIXTURES = join(__dirname, "fixtures");

/** Extensão do arquivo temporário por formato detectado. */
const EXTENSAO: Record<ImportFileFormat, string> = {
  XLSX: ".xlsx",
  XLSM: ".xlsm",
  XLS: ".xls",
  ODS: ".ods",
  PDF: ".pdf",
  CSV: ".csv",
};

const EXEMPLOS: Array<{ fixture: string; format: ImportFileFormat; abas: number }> = [
  { fixture: "exemplo-clientes.xlsx", format: "XLSX", abas: 1 },
  { fixture: "exemplo-clientes.xlsm", format: "XLSM", abas: 1 },
  { fixture: "exemplo-clientes.xls", format: "XLS", abas: 1 },
  { fixture: "exemplo-clientes.ods", format: "ODS", abas: 1 },
  { fixture: "exemplo-clientes.pdf", format: "PDF", abas: 1 },
  { fixture: "exemplo-clientes.tsv", format: "CSV", abas: 1 },
  { fixture: "exemplo-clientes.txt", format: "CSV", abas: 1 },
];

async function comArquivoEmDisco(
  fixture: string,
  formato: ImportFileFormat,
  fn: (caminho: string) => Promise<void>,
): Promise<void> {
  const buffer = await readFile(join(FIXTURES, fixture));
  const dir = await mkdtemp(join(tmpdir(), "import-fase1-"));
  const caminho = join(dir, `arquivo${EXTENSAO[formato]}`);
  await writeFile(caminho, buffer);
  try {
    await fn(caminho);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("leitura por formato detectado", () => {
  it.each(EXEMPLOS)(
    "lê $fixture ($format) do começo ao fim",
    async ({ fixture, format, abas }) => {
      const buffer = await readFile(join(FIXTURES, fixture));
      const detected = detectImportFormat(buffer);
      expect(detected).toBe(format);

      await comArquivoEmDisco(fixture, detected, async (caminho) => {
        const sheets = await readSpreadsheetSheets(caminho, detected);
        expect(sheets).toHaveLength(abas);
        expect(sheets[0].headers).toEqual(["Nome", "WhatsApp", "Valor", "Data"]);
        expect(sheets[0].rows).toHaveLength(3);
        expect(sheets[0].rows[0]).toEqual({
          Nome: "Ana Souza",
          WhatsApp: "11987654321",
          Valor: "1.234,56",
          Data: "01/02/2026",
        });
      });
    },
  );

  it("CSV/TSV/TXT não têm aba (sheetName nulo)", async () => {
    await comArquivoEmDisco("exemplo-clientes.tsv", "CSV", async (caminho) => {
      const sheets = await readSpreadsheetSheets(caminho, "CSV");
      expect(sheets[0].sheetName).toBeNull();
    });
  });

  it("PDF não tem aba (sheetName nulo)", async () => {
    await comArquivoEmDisco("exemplo-clientes.pdf", "PDF", async (caminho) => {
      const sheets = await readSpreadsheetSheets(caminho, "PDF");
      expect(sheets[0].sheetName).toBeNull();
    });
  });
});

describe("casos hostis por formato", () => {
  it("XLS: OLE2 que não é workbook", async () => {
    await comArquivoEmDisco("hostil-xls-invalido.xls", "XLS", async (caminho) => {
      await expect(readSpreadsheetSheets(caminho, "XLS")).rejects.toThrow(/xls/i);
    });
  });

  it("ODS: OpenDocument sem content.xml", async () => {
    await comArquivoEmDisco("hostil-ods-sem-content.ods", "ODS", async (caminho) => {
      await expect(readSpreadsheetSheets(caminho, "ODS")).rejects.toThrow(/content\.xml/i);
    });
  });

  it("ODS: OpenDocument de texto (não é planilha)", async () => {
    await comArquivoEmDisco("hostil-ods-texto.ods", "ODS", async (caminho) => {
      await expect(readSpreadsheetSheets(caminho, "ODS")).rejects.toThrow(
        /não tem planilha|não é uma planilha/i,
      );
    });
  });

  it("PDF: digitalização sem texto selecionável", async () => {
    await comArquivoEmDisco("hostil-pdf-sem-texto.pdf", "PDF", async (caminho) => {
      await expect(readSpreadsheetSheets(caminho, "PDF")).rejects.toThrow(
        /texto|escaneado/i,
      );
    });
  });

  it("TXT: binário disfarçado de texto", async () => {
    await comArquivoEmDisco("hostil-binario.txt", "CSV", async (caminho) => {
      await expect(readSpreadsheetSheets(caminho, "CSV")).rejects.toThrow();
    });
  });
});
