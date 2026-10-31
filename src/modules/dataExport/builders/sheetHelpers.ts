/**
 * Helpers das abas da exportação.
 *
 * Cada aba é descrita por uma lista de colunas (`ColumnSpec`) e escrita
 * linha a linha. O formato (moeda, data, boolean) vem do tipo da coluna —
 * assim a planilha sai com data real do Excel, valor numérico em BRL e
 * "Sim/Não" para booleano, sem repetir regra em cada aba.
 *
 * A escrita é feita contra `SheetTarget`: a mesma aba pode virar `.xlsx`
 * (streaming) ou CSV (modo .zip) sem duplicar regra de negócio.
 */
import type ExcelJS from "exceljs";
import { safeBool, safeNumber, safeText } from "../utils/cellSafety";

export type ColumnType =
  | "text"
  | "currency"
  | "date"
  | "datetime"
  | "time"
  | "int"
  | "decimal"
  | "bool";

export interface ColumnSpec {
  header: string;
  type: ColumnType;
  width: number;
}

export type CellValue = string | number | boolean | Date | null;

/** Linha devolvida ao adicionar uma linha (estilos são opcionais). */
export interface SheetRow {
  font?: unknown;
  fill?: unknown;
  alignment?: unknown;
  getCell(index: number): { numFmt?: string };
}

/** Destino da escrita de uma aba. */
export interface SheetTarget {
  /** Cabeçalho congelado (o xlsx já nasce com a visão fixa; o CSV ignora). */
  setViews(views: unknown): void;
  /** Filtro automático da aba. */
  setAutoFilter(range: unknown): void;
  getColumn(index: number): { width?: number; numFmt?: string };
  addRow(values: unknown[]): SheetRow;
}

/** Contexto handed to every sheet builder. */
export interface SheetContext {
  shop: {
    id: string;
    name: string;
    city: string | null;
    whatsapp: string | null;
    cnpj: string | null;
    address: string | null;
    businessSegment: string | null;
    oabRegistration: string | null;
    timezone: string;
    operationMode: string | null;
    socialLinks: unknown;
  };
  period: {
    preset: string;
    from: Date | null;
    to: Date | null;
    label: string;
    timezone: string;
  };
  previousPeriod: {
    from: Date | null;
    to: Date | null;
    label: string;
  } | null;
  options: { anonymize: boolean; includeCase: boolean };
  segment: string | null;
  generatedAt: Date;
  /** Avisos coletados durante a geração (aparecem no Resumo e no Leia-me). */
  warnings: string[];
  /** Abas que entram nesta planilha (o Leia-me explica cada uma). */
  includedSheets: Array<{ key: string; name: string; description: string }>;
}

/** Uma aba da exportação. */
export interface SheetBuilder {
  /** Chave do módulo (para gating e para o CSV). */
  key: string;
  /** Nome da aba no Excel. */
  name: string;
  /** Quando false, a aba não entra (módulo indisponível). */
  enabled?: boolean;
  build(ctx: SheetContext, sheet: SheetTarget): Promise<void>;
}

/** NumFmt por tipo de coluna. */
const NUM_FMT: Record<ColumnType, string | null> = {
  text: null,
  currency: 'R$ #,##0.00',
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
  time: null,
  int: "#,##0",
  decimal: "#,##0.00",
  bool: null,
};

/** Aplica larguras, formatação, cabeçalho congelado e filtro automático. */
export function setupSheet(sheet: SheetTarget, columns: ColumnSpec[]): void {
  sheet.setViews([{ state: "frozen", ySplit: 1 }]);
  columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width;
    const fmt = NUM_FMT[column.type];
    if (fmt) target.numFmt = fmt;
  });
  const header = sheet.addRow(columns.map((column) => column.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  header.alignment = { vertical: "middle" };
  sheet.setAutoFilter({
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  });
}

/** Converte o valor bruto no tipo da coluna (texto passa pela neutralização). */
export function formatCell(type: ColumnType, value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "currency":
      return safeNumber(value);
    case "date": {
      if (!(value instanceof Date)) return null;
      return Number.isNaN(value.getTime()) ? null : value;
    }
    case "datetime": {
      if (!(value instanceof Date)) return null;
      return Number.isNaN(value.getTime()) ? null : value;
    }
    case "int": {
      const parsed = safeNumber(value);
      return parsed === null ? null : Math.round(parsed);
    }
    case "decimal":
      return safeNumber(value);
    case "bool":
      return safeBool(value);
    case "time":
      return safeText(value);
    default:
      return safeText(value);
  }
}

/** Escreve uma linha aplicando o tipo de cada coluna. */
export function addRow(sheet: SheetTarget, columns: ColumnSpec[], values: unknown[]): void {
  sheet.addRow(columns.map((column, index) => formatCell(column.type, values[index])));
}

/**
 * Linha de relatório (rótulo + valor) — usada no Resumo e no Leia-me.
 * O valor recebe o formato da sua própria linha (moeda continua numérica).
 */
export function addReportRow(
  sheet: SheetTarget,
  label: string,
  value: unknown,
  type: ColumnType = "text",
): void {
  const row = sheet.addRow([label, formatCell(type, value)]);
  const fmt = NUM_FMT[type];
  if (fmt) row.getCell(2).numFmt = fmt;
}

/** Título de seção dentro de uma aba de relatório. */
export function addSectionRow(sheet: SheetTarget, title: string): void {
  const row = sheet.addRow([title]);
  row.font = { bold: true, color: { argb: "FF1F2937" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
}

/** Linha em branco (respiro entre seções). */
export function addBlankRow(sheet: SheetTarget): void {
  sheet.addRow([]);
}

/**
 * Escrita por cursor (paginação): a aba não carrega tudo em memória.
 * `fetchPage` recebe o cursor da última linha lida (null na primeira).
 */
export async function* paginate<T extends { id: string }>(
  fetchPage: (cursor: string | null) => Promise<T[]>,
  batchSize = 500,
): AsyncGenerator<T> {
  let cursor: string | null = null;
  for (;;) {
    const rows = await fetchPage(cursor);
    if (rows.length === 0) return;
    for (const row of rows) yield row;
    if (rows.length < batchSize) return;
    cursor = rows[rows.length - 1].id;
  }
}

/** Rótulo do dia da semana (0 = domingo). */
export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** Situação do agendamento em PT-BR (rótulos aceitos pela importação). */
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  CHECKED_IN: "Chegou",
  NO_SHOW: "Faltou",
};

/** Origem do agendamento em PT-BR. */
export const APPOINTMENT_SOURCE_LABELS: Record<string, string> = {
  APP: "App",
  PUBLIC: "Público",
  WHATSAPP_OWNER_BOT: "WhatsApp",
  IMPORT: "Importação",
};

/** Modalidade em PT-BR. */
export const MODALITY_LABELS: Record<string, string> = {
  IN_PERSON: "Presencial",
  VIDEO: "Online",
  PHONE: "Telefone",
};

/** Tipo de movimento de estoque em PT-BR. */
export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  IN: "Entrada",
  OUT: "Saída",
  SALE: "Venda",
  ADJUSTMENT: "Ajuste",
  RETURN: "Devolução",
  IMPORT: "Importação",
};

/** ── Destinos de escrita ──────────────────────────────────────────────────── */

/** Escreve em uma worksheet do exceljs (streaming). */
export class XlsxSheetTarget implements SheetTarget {
  constructor(private worksheet: ExcelJS.Worksheet) {}

  /**
   * O writer em streaming define a visão congelada na criação da worksheet
   * (`views` é somente leitura depois disso) — por isso aqui é no-op.
   */
  setViews(): void {
    // já definido em addWorksheet({ views: [...] })
  }

  setAutoFilter(range: unknown): void {
    this.worksheet.autoFilter = range as ExcelJS.Worksheet["autoFilter"];
  }

  getColumn(index: number): { width?: number; numFmt?: string } {
    return this.worksheet.getColumn(index);
  }

  addRow(values: unknown[]): SheetRow {
    return this.worksheet.addRow(values) as unknown as SheetRow;
  }
}

/** Escreve em memória as linhas de um CSV (uma aba por arquivo). */
export class CsvSheetTarget implements SheetTarget {
  readonly rows: string[][] = [];

  setViews(): void {
    // CSV não tem visão congelada
  }

  setAutoFilter(): void {
    // CSV não tem filtro automático
  }

  getColumn(): { width?: number; numFmt?: string } {
    return {};
  }

  addRow(values: unknown[]): SheetRow {
    this.rows.push(values.map(csvValue));
    return {
      getCell: () => ({}),
    };
  }
}

/** Valor de CSV: data em dd/mm/aaaa, número no formato pt-BR, texto escapado. */
export function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return value.toLocaleString("pt-BR", { timeZone: "UTC" });
  }
  if (typeof value === "number") {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  let text = String(value);
  // Neutralização de fórmula (mesma regra do xlsx).
  if (/^[=+@]/.test(text) || text.startsWith("\t") || text.startsWith("\r")) {
    text = `'${text}`;
  } else if (text.startsWith("-") && !/^-?\d+(?:[.,]\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  if (text.includes(";") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
