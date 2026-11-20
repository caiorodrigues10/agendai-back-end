import { demoShowcaseFingerprint } from "./demoShowcaseAssets";

/**
 * Helpers puros compartilhados pelo seed de showcase (base + densidade).
 * Módulo sem dependências de Prisma/rotas para poder ser importado por
 * `demoShowcaseSeed` e `demoShowcaseDensity` sem ciclo de imports.
 */

export function demoShowcaseUuid(namespace: string, key: string): string {
  if (!/^[0-9a-f]{8}$/u.test(namespace)) {
    throw new Error(`Namespace de UUID inválido: ${namespace}`);
  }
  const hash = demoShowcaseFingerprint(key);
  return `${namespace}-5000-4000-8000-${hash.slice(0, 12)}`;
}

export function saoPauloCivilDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Não foi possível converter data para São Paulo");
  return `${year}-${month}-${day}`;
}

/** Relógio civil de São Paulo no formato "HH:MM" (24 horas). */
export function saoPauloCivilTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find(part => part.type === "hour")?.value;
  const minute = parts.find(part => part.type === "minute")?.value;
  if (!hour || !minute) throw new Error("Não foi possível converter horário para São Paulo");
  return `${hour}:${minute}`;
}

/** Data e horário civil de São Paulo, capturados no mesmo instante. */
export function saoPauloCivilDateTime(date: Date): { date: string; time: string } {
  return { date: saoPauloCivilDate(date), time: saoPauloCivilTime(date) };
}

/**
 * Primeira data civil aberta a partir de `startDate` (inclusive).
 * A função é pura e limitada para impedir laços infinitos com presets inválidos.
 */
export function findNextOpenCivilDate(
  startDate: string,
  isOpen: (civilDate: string) => boolean,
  maxDays = 31,
): string {
  for (let offset = 0; offset <= maxDays; offset += 1) {
    const candidate = addDaysToCivilDate(startDate, offset);
    if (isOpen(candidate)) return candidate;
  }
  throw new Error(`Nenhum dia aberto encontrado em ${maxDays + 1} dias a partir de ${startDate}`);
}

export function addDaysToCivilDate(civilDate: string, days: number): string {
  const [year, month, day] = civilDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function civilDateToUtcDate(civilDate: string): Date {
  const [year, month, day] = civilDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Dia da semana da data civil (0 = domingo … 6 = sábado). */
export function civilDateWeekday(civilDate: string): number {
  return civilDateToUtcDate(civilDate).getUTCDay();
}

/** Minutos desde 00:00 de "HH:MM". */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "HH:MM" a partir de minutos desde 00:00 (0..1439). */
export function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(total)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Data civil + minutos (horário civil de São Paulo) → Date UTC.
 * São Paulo está em UTC-3 sem horário de verão desde 2019.
 */
export function civilDateMinutesToUtc(civilDate: string, minutes: number): Date {
  const base = civilDateToUtcDate(civilDate).getTime();
  return new Date(base + (minutes + 180) * 60_000);
}

/** Início (00:00 civil SP) do mês que contém `civilDate`. */
export function startOfCivilMonth(civilDate: string): string {
  return `${civilDate.slice(0, 7)}-01`;
}

/** Data civil do primeiro dia do mês seguinte ao que contém `civilDate`. */
export function startOfNextCivilMonth(civilDate: string): string {
  const [year, month] = civilDate.split("-").map(Number);
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export type DemoShowcaseRng = () => number;

/**
 * PRNG determinístico (mulberry32) semeado por hash da chave: a mesma chave
 * sempre produz a mesma sequência — idempotência do seed de showcase.
 */
export function demoShowcaseRng(key: string): DemoShowcaseRng {
  let state = parseInt(demoShowcaseFingerprint(key).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Escolhe um item com peso (pesos 0 são ignorados). */
export function pickWeighted<T>(rng: DemoShowcaseRng, entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

export function pickOne<T>(rng: DemoShowcaseRng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** Inteiro aleatório inclusivo entre min e max. */
export function randomInt(rng: DemoShowcaseRng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
