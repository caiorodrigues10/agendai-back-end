/**
 * Parser determinístico de data e hora em português.
 *
 * Sem IA: o assistente entende um conjunto fechado de formatos. Data e hora
 * saem sempre no formato "YYYY-MM-DD" e "HH:MM" (horário de Brasília).
 */

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  segundafeira: 1,
  terca: 2,
  tercafeira: 2,
  quarta: 3,
  quartafeira: 3,
  quinta: 4,
  quintafeira: 4,
  sexta: 5,
  sextafeira: 5,
  sabado: 6,
};

/** Remove acentos e minúsculas — base de todas as comparações. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Data de hoje no fuso America/Sao_Paulo, em "YYYY-MM-DD". */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Interpreta a data informada pelo dono.
 * Aceita: "hoje", "amanha", "depois de amanha", "dd/mm", "dd/mm/aaaa",
 * "dia dd", nome do dia da semana ("segunda", "sexta") e "proximo <dia>".
 */
export function parseOwnerBotDate(
  raw: string,
  todayIso: string = todayInSaoPaulo()
): string | null {
  const text = normalizeText(raw);
  if (!text) return null;

  if (text.includes("depois de amanha")) {
    return shiftDate(todayIso, 2);
  }
  if (text.includes("amanha")) {
    return shiftDate(todayIso, 1);
  }
  if (/\bhoje\b/.test(text)) {
    return todayIso;
  }

  const numeric = text.match(/(\d{1,2})[\/\-. ](\d{1,2})(?:[\/\-. ](\d{2,4}))?/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : Number(todayIso.slice(0, 4));
    if (year < 100) year += 2000;
    if (!isValidDate(year, month, day)) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const weekdayMatch = text.match(/\b(?:proximo|proxima|na|esta)?\s*([a-z]+)\b/);
  if (weekdayMatch) {
    const key = weekdayMatch[1].replace(/\s/g, "");
    const target = WEEKDAYS[key];
    if (target === undefined) return null;
    const todayDate = new Date(`${todayIso}T00:00:00Z`);
    const todayWeekday = todayDate.getUTCDay();
    let delta = (target - todayWeekday + 7) % 7;
    if (delta === 0) delta = 7;
    return shiftDate(todayIso, delta);
  }

  return null;
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Interpreta a hora informada pelo dono.
 * Aceita: "14:30", "14h30", "14h", "1430", "14".
 */
export function parseOwnerBotTime(raw: string): string | null {
  const text = normalizeText(raw).replace(/\s+/g, "");
  const withColon = text.match(/(\d{1,2}):(\d{2})/);
  if (withColon) {
    const hours = Number(withColon[1]);
    const minutes = Number(withColon[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  const withH = text.match(/(\d{1,2})h(\d{2})/);
  if (withH) {
    const hours = Number(withH[1]);
    const minutes = Number(withH[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  const onlyH = text.match(/^(\d{1,2})h$/);
  if (onlyH) {
    const hours = Number(onlyH[1]);
    if (hours > 23) return null;
    return `${pad(hours)}:00`;
  }

  const digits = text.match(/^(\d{3,4})$/);
  if (digits) {
    const value = digits[1].padStart(4, "0");
    const hours = Number(value.slice(0, 2));
    const minutes = Number(value.slice(2));
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  const plain = text.match(/^(\d{1,2})$/);
  if (plain) {
    const hours = Number(plain[1]);
    if (hours > 23) return null;
    return `${pad(hours)}:00`;
  }

  return null;
}

/** Data + hora em uma frase ("amanha as 14:30"). */
export function parseOwnerBotDateTime(
  raw: string,
  todayIso: string = todayInSaoPaulo()
): { date: string | null; time: string | null } {
  const datePart = raw.match(/(\d{1,2}[\/\-. ]\d{1,2}(?:[\/\-. ]\d{2,4})?)|hoje|amanha|depois de amanha|[a-z]+feira|domingo|sabado/i);
  const timePart = raw.match(/\d{1,2}(?::|h)\d{0,2}/);
  return {
    date: datePart ? parseOwnerBotDate(datePart[0], todayIso) : null,
    time: timePart ? parseOwnerBotTime(timePart[0]) : null,
  };
}
