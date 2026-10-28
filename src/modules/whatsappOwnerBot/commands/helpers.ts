import { normalizeText } from "../dateParser";
import { similarity } from "./matcher";
import type { OwnerBotCommandContext, OwnerBotEntities, OwnerBotPeriod } from "./types";

/**
 * Utilidades compartilhadas pelos comandos do assistente.
 */

/** Limite de caracteres por mensagem (WhatsApp fica ruim em textos longos). */
export const OWNER_BOT_MAX_MESSAGE_LENGTH = 1500;

/** Corta o texto preservando o começo (as mensagens são listas curtas). */
export function truncateMessage(text: string, max = OWNER_BOT_MAX_MESSAGE_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

/** Período do pedido; sem período no texto, usa o padrão do comando. */
export function periodOrDefault(
  entities: OwnerBotEntities,
  ctx: OwnerBotCommandContext,
  fallback: "day" | "week" | "month"
): OwnerBotPeriod {
  if (entities.period) return entities.period;
  return ctx.periods[fallback] ?? ctx.periods.day;
}

/** Linha de sugestão no fim da resposta. */
export function suggestionsLine(suggestions: string[] | undefined): string {
  if (!suggestions?.length) return "";
  return `\n\n${suggestions.map((suggestion) => `• ${suggestion}`).join("\n")}`;
}

/** Normaliza nome para comparação. */
export function normalizeName(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

/**
 * Encontra o melhor item de uma lista pelo nome citado pelo dono.
 * Aceita correspondência parcial ("maria" para "Maria Silva") e tolerante a
 * erro de digitação ("mraia" para "Maria").
 */
export function findByName<T>(
  items: T[],
  query: string | undefined,
  getName: (item: T) => string
): { item: T; score: number } | undefined {
  if (!query) return undefined;
  const target = normalizeName(query);
  if (!target) return undefined;

  let best: { item: T; score: number } | undefined;
  for (const item of items) {
    const name = normalizeName(getName(item));
    if (!name) continue;
    let score = similarity(target, name);
    if (name.includes(target) || target.includes(name)) score = Math.max(score, 0.9);
    const parts = name.split(" ");
    const first = parts[0];
    if (first && (first.includes(target) || target.includes(first))) {
      score = Math.max(score, 0.85);
    }
    if (!best || score > best.score) best = { item, score };
  }

  if (!best || best.score < 0.6) return undefined;
  return best;
}

/** Divide uma lista em linhas numeradas (máx. N itens). */
export function numberedList(
  items: Array<{ label: string }>,
  max = 10
): string {
  return items
    .slice(0, max)
    .map((item, index) => `${index + 1}. ${item.label}`)
    .join("\n");
}

/** Data curta em pt-BR a partir de "YYYY-MM-DD". */
export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  if (!month || !day) return isoDate;
  return `${day}/${month}`;
}

/** Converte "YYYY-MM-DD" em Date no fuso do salão (meia-noite local). */
export function isoDateToLocalDate(isoDate: string, timezone: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
