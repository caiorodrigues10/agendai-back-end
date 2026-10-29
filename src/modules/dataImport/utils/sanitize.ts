/**
 * Saneamento dos valores lidos da planilha.
 *
 * Três defesas:
 *   • prototype pollution — cabeçalhos nunca viram chave de objeto "normal";
 *     chaves perigosas são recusadas e o mapa de colunas usa `Map`;
 *   • fórmulas — nenhuma fórmula é avaliada; e no CSV de erros os valores
 *     são neutralizados para o Excel não executar o conteúdo;
 *   • texto — caracteres de controle são removidos e o tamanho é limitado.
 */

/** Chaves que não podem virar propriedade de objeto. */
export const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Diz se a chave é perigosa para prototype pollution. */
export function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(String(key).trim().toLowerCase());
}

/** Objeto sem prototype — seguro para receber chave vinda da planilha. */
export function createSafeRecord<T = string>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/**
 * Limpa o texto de uma célula: remove controles (exceto tab e newline
 * normalizados), colapsa espaços e corta o tamanho.
 */
export function sanitizeCellText(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : String(value);
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * Neutraliza conteúdo que o Excel interpretaria como fórmula.
 * Usado no CSV de erros: prefixa `'` em `=`, `+`, `-`, `@`, tab e CR.
 */
export function neutralizeCsvFormula(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!text) return "";
  const first = text[0];
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
    return `'${text}`;
  }
  return text;
}

/**
 * Gera o conteúdo do CSV de erros, com neutralização de fórmula e escape de
 * aspas. Separador `;` (padrão do Excel em pt-BR).
 */
export function buildErrorCsv(rows: Array<Record<string, string>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string) => {
    const neutralized = neutralizeCsvFormula(value);
    return /[";\n\r]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
  };
  const lines = [headers.map(escape).join(";")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header] ?? "")).join(";"));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
