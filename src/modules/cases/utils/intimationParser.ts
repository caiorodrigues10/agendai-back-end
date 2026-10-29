import type { CaseEventType } from "@prisma/client";

/**
 * Digestão de intimações de tribunal (PJe / Diário da Justiça / email).
 *
 * O PJe não expõe API pública universal para todos os tribunais; por isso o
 * escritório **cola** o texto da intimação (email, notificação, tabela de
 * movimentações) e este parser extrai:
 *  * número do processo (padrão CNJ);
 *  * tipo sugerido do andamento a partir de palavras-chave.
 *
 * Um provedor real de dados de tribunal pode plugar em `CourtDataProvider`
 * (ver `courtDataProvider.ts`) sem tocar em nenhum outro lugar do código.
 */

const CNJ_IN_TEXT =
  /(\d{7})[-.\s]?(\d{2})[-.\s]?(\d{4})[-.\s]?(\d)[-.\s]?([A-Za-z]{2}|\d{2})[-.\s]?(\d{4})/;

type KeywordRule = { keywords: RegExp; type: CaseEventType };

/**
 * Regras de classificação — da mais específica para a mais genérica.
 * A primeira regra que casar define o tipo sugerido.
 */
const KEYWORD_RULES: KeywordRule[] = [
  { keywords: /\b(audi[eê]ncia|diligência|oitiva)\b/i, type: "MEETING" },
  { keywords: /\b(sentença|acórdão|despacho|decisão|r\.?e\.?)\b/i, type: "COURT_MOTION" },
  { keywords: /\b(peti[cç][aã]o|protocolo|juntada|arquivamento)\b/i, type: "FILING" },
  { keywords: /\b(prazo|contraditório|recurso|embargos)\b/i, type: "DEADLINE" },
  { keywords: /\b(pagamento|depósito|valor|honorários)\b/i, type: "PAYMENT" },
  { keywords: /\b(intima[cç][aã]o|notificação|cita[cç][aã]o|mandado)\b/i, type: "INTIMATION" },
  { keywords: /\b(reunião|encontro|consulta)\b/i, type: "MEETING" },
];

/**
 * Extrai o número de processo (padrão CNJ) de um texto, normalizando-o.
 * Retorna null quando não há correspondência.
 */
export function extractCaseNumber(text: string): string | null {
  const match = CNJ_IN_TEXT.exec(text);
  if (!match) return null;
  const [, seq, branch, year, jurisdiction, tribunal, origin] = match;
  return `${seq}-${branch}.${year}.${jurisdiction}.${tribunal.toUpperCase()}.${origin}`;
}

/**
 * Sugere o tipo de andamento a partir das palavras-chave do texto.
 * Padrão: INTIMATION (o tipo genérico de intimação).
 */
export function suggestEventType(text: string): CaseEventType {
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.test(text)) return rule.type;
  }
  return "INTIMATION";
}

export interface ParsedIntimationLine {
  subject: string;
  body: string;
  detectedNumber: string | null;
  suggestedType: CaseEventType;
}

/**
 * Quebra um texto colado em intimações individuais.
 *
 * Formatos aceitos:
 *  * linhas separadas por quebra simples (uma intimação por linha); ou
 *  * um bloco único com várias linhas (uma intimação, corpo completo).
 *
 * Regra: se houver mais de uma linha **e** alguma delas casar o padrão CNJ,
 * cada linha vira uma intimação (formato tabela do PJe); caso contrário o
 * texto inteiro vira uma única intimação.
 */
export function parseIntimationText(rawText: string): ParsedIntimationLine[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const linesWithNumber = lines.filter((l) => CNJ_IN_TEXT.test(l));
  const multi = lines.length > 1 && linesWithNumber.length > 1;

  if (!multi) {
    const body = lines.join("\n");
    return [
      {
        subject: buildSubject(lines[0]),
        body,
        detectedNumber: extractCaseNumber(body),
        suggestedType: suggestEventType(body),
      },
    ];
  }

  return lines.map((line) => ({
    subject: buildSubject(line),
    body: line,
    detectedNumber: extractCaseNumber(line),
    suggestedType: suggestEventType(line),
  }));
}

/** Assunto curto: primeira frase/segmento da linha, no máximo 300 chars. */
function buildSubject(line: string): string {
  const firstSentence = line.split(/(?<=[.;])\s/)[0] ?? line;
  return firstSentence.slice(0, 300);
}
