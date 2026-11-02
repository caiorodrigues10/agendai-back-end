import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseXlsxSheets } from "./xlsxParser";
import { parseOds } from "./odsParser";
import { parseXls } from "./xlsParser";

/**
 * Casos hostis — fórmula e link externo.
 *
 * A planilha enviada pelo dono é **dado**, nunca programa:
 *   • fórmula não é avaliada — entra o último valor literal guardado;
 *   • link externo não é resolvido — nenhuma requisição de rede é feita e o
 *     endereço não entra no dado importado (entra o rótulo do link).
 *
 * O teste espiona `fetch` global: se qualquer leitor tentasse buscar o link,
 * o teste quebraria.
 */

const FIXTURES = join(__dirname, "fixtures");

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe("fórmula e link externo nunca são executados nem resolvidos", () => {
  it("XLSX: entra o valor em cache e o rótulo do link (nada de rede)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const sheets = await parseXlsxSheets(fixture("hostil-formula-externa.xlsx"));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].headers).toEqual(["Nome", "WhatsApp", "Total", "Site"]);
    expect(sheets[0].rows).toEqual([
      ["Ana Souza", "11987654321", "42", "Ver site"],
      ["", "", "7", "Ver site externo"],
    ]);

    const dump = JSON.stringify(sheets);
    expect(dump).not.toMatch(/SUM|SUM\(/i);
    expect(dump).not.toMatch(/externo\.xlsx/i);
    expect(dump).not.toMatch(/https?:\/\//i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("XLSM: macro presente, fórmula e link externo ignorados", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const sheets = await parseXlsxSheets(fixture("hostil-formula-externa.xlsm"));

    expect(sheets[0].rows[0]).toEqual(["Ana Souza", "11987654321", "42", "Ver site"]);

    const dump = JSON.stringify(sheets);
    expect(dump).not.toMatch(/SUM/i);
    expect(dump).not.toMatch(/https?:\/\//i);
    expect(dump).not.toMatch(/vbaProject|macro-ignorada/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ODS: entra o valor em cache e o rótulo do link (nada de rede)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const sheets = await parseOds(fixture("hostil-formula-externa.ods"));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows).toEqual([
      ["Ana Souza", "11987654321", "42", "Ver site"],
      ["Bruno Lima", "11988887777", "7", "Ver site externo"],
    ]);

    const dump = JSON.stringify(sheets);
    expect(dump).not.toMatch(/of:=/i);
    expect(dump).not.toMatch(/externo\.ods/i);
    expect(dump).not.toMatch(/https?:\/\//i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("XLS: a fórmula externa vira só o valor em cache", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const sheets = await parseXls(fixture("exemplo-formula.xls"));

    expect(sheets[0].rows).toEqual([
      ["Ana Souza", "11987654321", "42"],
      ["Bruno Lima", "11988887777", "7"],
    ]);
    expect(JSON.stringify(sheets)).not.toMatch(/SUM|externo/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
