import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOds } from "./odsParser";

/**
 * Fase 1 — OpenDocument Spreadsheet (.ods).
 *
 * O `.ods` é um ZIP com `content.xml`. O parser lê só as células (nada de
 * estilo, fórmula ou macro) e devolve o mesmo formato de aba que o parser de
 * planilha devolve — é o mesmo lote, o mesmo mapeamento e a mesma revisão.
 */

const FIXTURES = join(__dirname, "fixtures");

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe("parseOds", () => {
  it("lê cabeçalho e linhas da planilha de exemplo", async () => {
    const sheets = await parseOds(fixture("exemplo-clientes.ods"));

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

  it("recusa um ODS sem content.xml (não é planilha)", async () => {
    await expect(parseOds(fixture("hostil-ods-sem-content.ods"))).rejects.toThrow(
      /content\.xml/i,
    );
  });

  it("recusa um ZIP que passou na detecção mas não tem planilha", async () => {
    const zip = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    ]);
    await expect(parseOds(zip)).rejects.toThrow();
  });
});
