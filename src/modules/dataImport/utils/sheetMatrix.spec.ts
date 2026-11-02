import { describe, expect, it } from "vitest";
import { buildSheetMatrix } from "./sheetMatrix";

/**
 * Fase 1 — transformar a matriz bruta de células em "cabeçalho + linhas".
 *
 * Problemas reais que a matriz bruta traz:
 *   • linha de título/capa antes do cabeçalho ("Clientes — abril/2026");
 *   • cabeçalho na 2ª, 3ª… linha (a exportação de sistema antigo sempre
 *     coloca um logotipo ou um período antes);
 *   • linhas de total/rodapé no fim ("TOTAL", "Gerado em ...").
 *
 * Regra do cabeçalho: a **primeira linha mais larga** (mais células com
 * conteúdo) é o cabeçalho — linhas anteriores sãoignored como capa.
 */

describe("buildSheetMatrix", () => {
  it("usa a primeira linha como cabeçalho quando ela é a mais larga", () => {
    const result = buildSheetMatrix([
      ["Nome", "WhatsApp"],
      ["Ana", "11987654321"],
    ]);

    expect(result.headers).toEqual(["Nome", "WhatsApp"]);
    expect(result.rows).toEqual([["Ana", "11987654321"]]);
    expect(result.preambleRows).toBe(0);
  });

  it("ignora a linha de título e usa o cabeçalho mais abaixo", () => {
    const result = buildSheetMatrix([
      ["Relatório de clientes — abril de 2026"],
      [],
      ["Nome", "WhatsApp", "Valor"],
      ["Ana", "11987654321", "10,00"],
    ]);

    expect(result.headers).toEqual(["Nome", "WhatsApp", "Valor"]);
    expect(result.rows).toEqual([["Ana", "11987654321", "10,00"]]);
    expect(result.preambleRows).toBe(1);
  });

  it("descarta a linha de total e a conta para o aviso", () => {
    const result = buildSheetMatrix([
      ["Nome", "WhatsApp", "Valor"],
      ["Ana", "11987654321", "10,00"],
      ["TOTAL", "", "10,00"],
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.skippedTotalRows).toBe(1);
  });

  it("não descarta linha que começa com 'Total' mas não tem valor numérico", () => {
    const result = buildSheetMatrix([
      ["Nome", "WhatsApp"],
      ["Total Expressao", "11987654321"],
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.skippedTotalRows).toBe(0);
  });

  it("descarta o rodapé ('Gerado em …') que só tem uma célula", () => {
    const result = buildSheetMatrix([
      ["Nome", "WhatsApp", "Valor"],
      ["Ana", "11987654321", "10,00"],
      ["Gerado em 01/05/2026", "", ""],
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.skippedTotalRows).toBe(1);
  });

  it("não descarta um cliente que só tem o nome preenchido", () => {
    const result = buildSheetMatrix([
      ["Nome", "WhatsApp", "Valor"],
      ["Ana Souza", "", ""],
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.skippedTotalRows).toBe(0);
  });

  it("completa com vazio as linhas curtas e descarta as excedentes", () => {
    const result = buildSheetMatrix([
      ["Nome", "WhatsApp", "Valor"],
      ["Ana"],
      ["Bruno", "11988887777", "10,00", "extra"],
    ]);

    expect(result.rows).toEqual([
      ["Ana", "", ""],
      ["Bruno", "11988887777", "10,00"],
    ]);
  });

  it("recusa matriz sem nenhuma linha de 2+ colunas", () => {
    expect(() => buildSheetMatrix([["Só um texto"]])).toThrow();
  });
});
