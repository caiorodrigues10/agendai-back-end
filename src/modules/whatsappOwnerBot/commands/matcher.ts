import type { BusinessSegment } from "@prisma/client";
import { normalizeText } from "../dateParser";
import type { OwnerBotCommand, OwnerBotRiskClass } from "./types";

/**
 * Casa a mensagem do dono com um comando do registry.
 *
 * Duas passadas:
 * 1. gatilhos exatos (regex) — pontuação pelo tamanho do trecho casado;
 * 2. fallback aproximado (distância de edição por token) — para erros de
 *    digitação e abreviações ("faturmento", "caixa hj").
 *
 * Abaixo do limiar, o matcher devolve as alternativas para o serviço
 * desambiguar com o dono (nunca executa no escuro).
 */

export type OwnerBotCommandMatch = {
  command: OwnerBotCommand;
  score: number;
};

export type OwnerBotMatchResult = {
  best?: OwnerBotCommandMatch;
  alternatives: OwnerBotCommandMatch[];
};

const EXACT_THRESHOLD = 6;
const FUZZY_THRESHOLD = 0.66;

export function matchOwnerBotCommand(
  rawText: string,
  commands: OwnerBotCommand[],
  segment?: BusinessSegment | null
): OwnerBotMatchResult {
  const text = normalizeText(rawText).replace(/\s+/g, " ");
  if (!text) return { alternatives: [] };

  const applicable = commands.filter((command) => commandApplies(command, segment));
  const exact: OwnerBotCommandMatch[] = [];

  for (const command of applicable) {
    let best = 0;
    for (const trigger of command.triggers) {
      const match = text.match(trigger);
      if (!match) continue;
      const matched = match[0].trim();
      // Gatilho mais específico (mais palavras) pontua mais.
      const words = matched.split(/\s+/).filter(Boolean).length;
      const score = matched.length + words * 3 + riskBonus(command.risk);
      if (score > best) best = score;
    }
    if (best > 0) exact.push({ command, score: best });
  }

  if (exact.length) {
    exact.sort((a, b) => b.score - a.score);
    const best = exact[0];
    if (best.score >= EXACT_THRESHOLD) {
      return { best, alternatives: exact.slice(1, 4) };
    }
    // empate perto: devolve alternativas para o dono escolher
    const tied = exact.filter((item) => best.score - item.score <= 2);
    if (tied.length > 1) {
      return { alternatives: tied.slice(0, 4) };
    }
  }

  const fuzzy = fuzzyMatches(text, applicable);
  if (fuzzy.length && fuzzy[0].score >= FUZZY_THRESHOLD) {
    return { best: fuzzy[0], alternatives: fuzzy.slice(1, 4) };
  }

  return { alternatives: fuzzy.slice(0, 4) };
}

/**
 * Ação pede prioridade sobre consulta quando os dois casam.
 * Ex.: "gastei 80 de produto" deve virar despesa, não consulta de estoque.
 */
function riskBonus(risk: OwnerBotRiskClass): number {
  if (risk === "SENSITIVE") return 8;
  if (risk === "WRITE") return 5;
  return 0;
}

/** O comando está disponível no segmento? */
export function commandApplies(
  command: OwnerBotCommand,
  segment?: BusinessSegment | null
): boolean {
  if (!command.segments || !segment) return true;
  return command.segments.includes(segment);
}

function fuzzyMatches(text: string, commands: OwnerBotCommand[]): OwnerBotCommandMatch[] {
  const tokens = text.split(" ").filter((token) => token.length > 1);
  if (!tokens.length) return [];

  const results: OwnerBotCommandMatch[] = [];
  for (const command of commands) {
    const keywords = commandKeywords(command);
    if (!keywords.length) continue;

    let matched = 0;
    let strong = 0;
    for (const token of tokens) {
      const best = keywords.reduce(
        (acc, keyword) => Math.min(acc, similarity(token, keyword)),
        1
      );
      if (best >= FUZZY_THRESHOLD) {
        matched += 1;
        if (token.length >= 4) strong += 1;
      }
    }
    const coverage = matched / tokens.length;
    if (!strong) continue;
    results.push({ command, score: coverage });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/** Palavras-chave do comando: as declaradas ou as extraídas dos gatilhos. */
export function commandKeywords(command: OwnerBotCommand): string[] {
  if (command.keywords?.length) return command.keywords.map((word) => normalizeText(word));
  const words = new Set<string>();
  for (const trigger of command.triggers) {
    const source = trigger.source;
    const literal = source.replace(/[.*+?^${}()|[\]\\]/g, " ").replace(/\\b|\\d|\?|\+|\*/g, " ");
    for (const token of literal.split(/\s+/)) {
      const clean = token.trim();
      if (clean.length >= 4 && /^[a-z0-9]+$/.test(clean)) words.add(clean);
    }
  }
  return [...words];
}

/** Similaridade 0..1 entre dois tokens (distância de edição normalizada). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const distance = levenshtein(a, b);
  const longest = Math.max(a.length, b.length);
  return 1 - distance / longest;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}
