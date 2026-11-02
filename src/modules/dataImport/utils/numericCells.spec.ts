import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import * as XLSX from "@e965/xlsx";
import { parseXlsxSheets } from "./xlsxParser";
import { parseXls } from "./xlsParser";
import { parseOds } from "./odsParser";
import { normalizePhone } from "./rowNormalization";
import { looksScientificNotation } from "./numericText";

/**
 * Fase 1 — o número da planilha vira **texto**, sem perder dígito.
 *
 * É aqui que mora o risco real do importador: o telefone é a identidade do
 * cliente no CRM e o CPF é documento. O Excel/show do sistema antigo às vezes
 * entrega o número em notação científica (`1,23456789E+10`) — os dígitos
 * dessa forma são **outros**, e um deles até parece um telefone válido.
 *
 * Regras verificadas aqui:
 *   • telefone **sem zero à esquerda** (11 dígitos) → preservado exatamente;
 *   • telefone **com zero à esquerda** (`0` + DDD + número) → o zero some, o
 *     número não;
 *   • notação científica → nunca vira identidade (a linha é rejeitada);
 *   • CPF como número → lido sem notação científica e sem perder dígito.
 */

/** Linha de exemplo: [rótulo, valor da célula]. */
const CELULAS: Array<[string, string | number]> = [
  ["telefone sem zero à esquerda (texto)", "11987654321"],
  ["telefone sem zero à esquerda (número)", 11987654321],
  ["telefone com zero à esquerda (texto)", "011987654321"],
  ["telefone em notação científica", "1,1987654321E+10"],
  ["CPF como número", 12345678901],
  ["CPF em notação científica", "1,23456789E+10"],
  ["CPF com zero à esquerda (texto)", "01234567890"],
];

async function xlsxComNumeros(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  ws.addRow(["Rotulo", "Valor"]);
  for (const [rotulo, valor] of CELULAS) ws.addRow([rotulo, valor]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function xlsComNumeros(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Rotulo", "Valor"],
    ...CELULAS.map(([rotulo, valor]) => [rotulo, valor]),
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "biff8" }));
}

async function odsComNumeros(): Promise<Buffer> {
  const zip = new JSZip();
  const linhas = [
    ["Rotulo", "Valor"],
    ...CELULAS.map(([rotulo, valor]) => [rotulo, String(valor)]),
  ]
    .map(
      (linha) =>
        `<table:table-row>${linha
          .map(
            (valor) =>
              `<table:table-cell office:value-type="string"><text:p>${valor}</text:p></table:table-cell>`,
          )
          .join("")}</table:table-row>`,
    )
    .join("");
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:spreadsheet><table:table table:name="Clientes">${linhas}</table:table></office:spreadsheet></office:body>
</office:document-content>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Arquivos por formato: [rótulo, linhas lidas]. */
const FORMATOS: Array<{
  nome: string;
  ler: () => Promise<string[][]>;
}> = [
  {
    nome: "xlsx",
    ler: async () => (await parseXlsxSheets(await xlsxComNumeros()))[0].rows,
  },
  {
    nome: "xls",
    ler: async () => (await parseXls(xlsComNumeros()))[0].rows,
  },
  {
    nome: "ods",
    ler: async () => (await parseOds(await odsComNumeros()))[0].rows,
  },
];

describe("célula numérica vira texto sem perder dígito", () => {
  it.each(FORMATOS)("$nome: telefone sem zero à esquerda é preservado", async ({ ler }) => {
    const rows = await ler();
    const porRotulo = new Map(rows.map((row) => [row[0], row[1]]));

    expect(porRotulo.get("telefone sem zero à esquerda (texto)")).toBe("11987654321");
    expect(porRotulo.get("telefone sem zero à esquerda (número)")).toBe("11987654321");
  });

  it.each(FORMATOS)("$nome: CPF como número sai exato (sem notação científica)", async ({ ler }) => {
    const rows = await ler();
    const porRotulo = new Map(rows.map((row) => [row[0], row[1]]));

    expect(porRotulo.get("CPF como número")).toBe("12345678901");
  });

  it.each(FORMATOS)("$nome: notação científica chega como texto cru", async ({ ler }) => {
    const rows = await ler();
    const porRotulo = new Map(rows.map((row) => [row[0], row[1]]));

    expect(porRotulo.get("telefone em notação científica")).toBe("1,1987654321E+10");
    expect(porRotulo.get("CPF em notação científica")).toBe("1,23456789E+10");
  });
});

describe("normalizePhone — identidade do cliente", () => {
  it("mantém o telefone sem zero à esquerda", () => {
    expect(normalizePhone("11987654321")).toBe("11987654321");
  });

  it("mantém o telefone sem zero à esquerda quando vem como número", () => {
    expect(normalizePhone(String(11987654321))).toBe("11987654321");
  });

  it("tira o zero à esquerda (prefixo de operadora/antigo DDD)", () => {
    expect(normalizePhone("011987654321")).toBe("11987654321");
    expect(normalizePhone("01132551234")).toBe("1132551234");
  });

  it("tira o DDI 55", () => {
    expect(normalizePhone("+55 11 98765-4321")).toBe("11987654321");
    expect(normalizePhone("5511987654321")).toBe("11987654321");
  });

  it("recusa notação científica (os dígitos são outros)", () => {
    expect(normalizePhone("1,1987654321E+10")).toBeNull();
    // Esta forma tem 11 dígitos e PARECERIA um telefone válido — é exatamente
    // o caso perigoso: sem a guarda, viraria a identidade de outro cliente.
    expect(normalizePhone("1,23456789E+10")).toBeNull();
  });

  it("recusa número curto, longo demais e vazio", () => {
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("119876543211234")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("looksScientificNotation", () => {
  it("reconhece notação científica com e sem sinal", () => {
    expect(looksScientificNotation("1,23456789E+10")).toBe(true);
    expect(looksScientificNotation("1.5e-3")).toBe(true);
  });

  it("não confunde número normal com notação científica", () => {
    expect(looksScientificNotation("11987654321")).toBe(false);
    expect(looksScientificNotation("1.234,56")).toBe(false);
    expect(looksScientificNotation("E10")).toBe(false);
  });
});
