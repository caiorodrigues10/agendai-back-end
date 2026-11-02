import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePdf } from "./pdfParser";

/**
 * Fase 1 — PDF com texto selecionável.
 *
 * O PDF não tem "abas": o que importa é reconstruir as linhas e as colunas
 * a partir da posição do texto na página. PDF escaneado (sem texto) não tem
 * como virar planilha ainda — a Fase 2 (imagem/PDF escaneado) resolve isso.
 */

const FIXTURES = join(__dirname, "fixtures");

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe("parsePdf", () => {
  it("reconstrói cabeçalho e linhas da tabela do PDF", async () => {
    const sheets = await parsePdf(fixture("exemplo-clientes.pdf"));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].headers).toEqual(["Nome", "WhatsApp", "Valor", "Data"]);
    expect(sheets[0].rows).toHaveLength(3);
    expect(sheets[0].rows[0]).toEqual([
      "Ana Souza",
      "11987654321",
      "1.234,56",
      "01/02/2026",
    ]);
  });

  it("recusa PDF sem texto selecionável (digitalização)", async () => {
    await expect(parsePdf(fixture("hostil-pdf-sem-texto.pdf"))).rejects.toThrow(
      /texto|escaneado/i,
    );
  });

  it("recusa arquivo que não é PDF", async () => {
    await expect(parsePdf(Buffer.from("isto nao e um pdf"))).rejects.toThrow(/PDF/i);
  });

  it("recusa PDF com mais de 10 páginas antes de extrair o texto", async () => {
    await expect(parsePdf(fixture("hostil-pdf-muitas-paginas.pdf"))).rejects.toThrow(
      /12 páginas|limite é 10/i,
    );
  });

  it("recusa PDF que declara um objeto gigante (sem descompactar nada)", async () => {
    await expect(parsePdf(fixture("hostil-pdf-objeto-gigante.pdf"))).rejects.toThrow(
      /grande demais/i,
    );
  });
});
