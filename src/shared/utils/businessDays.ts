/**
 * Contagem de dias úteis e feriados — regra de prazo do escritório.
 *
 * Prazo no processo civil é contado em dias úteis: fins de semana não
 * contam, feriados nacionais não contam e as suspensões forenses do
 * escritório também não. Este módulo é a única fonte dessa regra.
 *
 * Datas são tratadas como **date-only em UTC** (`YYYY-MM-DD`): prazo não tem
 * hora, etimezone do servidor não pode deslocar a contagem em uma linha.
 */

/** Feriados nacionais fixos do Brasil (mês/dia). */
const FIXED_NATIONAL_HOLIDAYS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], // Confraternização Universal
  [4, 21], // Tiradentes
  [5, 1], // Dia do Trabalho
  [9, 7], // Independência
  [10, 12], // Nossa Senhora Aparecida
  [11, 2], // Finados
  [11, 15], // Proclamação da República
  [12, 25], // Natal
];

export interface HolidayLike {
  /** Data do feriado (date-only). */
  date: Date | string;
  name?: string | null;
}

/** Domingo = 0 … sábado = 6 (UTC). */
function dayOfWeek(date: Date): number {
  return date.getUTCDay();
}

/** `YYYY-MM-DD` de uma data (sem hora). */
export function toDateKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/** Date-only em UTC a partir de `YYYY-MM-DD`. */
export function fromDateKey(key: string): Date {
  return new Date(`${key.slice(0, 10)}T00:00:00.000Z`);
}

/** Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Feriados nacionais móveis do ano (Carnaval, Sexta-feira Santa, Corpus Christi). */
export function movableNationalHolidays(year: number): string[] {
  const easter = easterSunday(year);
  const offset = (days: number) => {
    const d = new Date(easter);
    d.setUTCDate(d.getUTCDate() + days);
    return toDateKey(d);
  };
  return [
    offset(-48), // Segunda de Carnaval
    offset(-47), // Terça de Carnaval
    offset(-2), // Sexta-feira Santa
    offset(60), // Corpus Christi
  ];
}

/** Feriados nacionais (fixos + móveis) de um ano, em `YYYY-MM-DD`. */
export function nationalHolidays(year: number): string[] {
  const fixed = FIXED_NATIONAL_HOLIDAYS.map(([month, day]) =>
    toDateKey(new Date(Date.UTC(year, month - 1, day)))
  );
  return [...fixed, ...movableNationalHolidays(year)];
}

/**
 * Feriados do escritório (suspensões forenses locais) em `YYYY-MM-DD`.
 */
export function officeHolidayKeys(holidays: HolidayLike[] | undefined | null): Set<string> {
  const keys = new Set<string>();
  for (const holiday of holidays ?? []) {
    if (!holiday?.date) continue;
    keys.add(toDateKey(holiday.date));
  }
  return keys;
}

/** O dia é útil? (não é fim de semana nem feriado nacional nem do escritório). */
export function isBusinessDay(
  date: Date | string,
  holidays?: HolidayLike[] | null
): boolean {
  const key = toDateKey(date);
  const day = dayOfWeek(fromDateKey(key));
  if (day === 0 || day === 6) return false;

  const year = Number(key.slice(0, 4));
  if (nationalHolidays(year).includes(key)) return false;

  return !officeHolidayKeys(holidays).has(key);
}

/**
 * Soma `days` dias úteis a partir de `from` (o dia inicial não conta).
 *
 * `days = 0` devolve o próprio dia, mesmo que não seja útil.
 */
export function addBusinessDays(
  from: Date | string,
  days: number,
  holidays?: HolidayLike[] | null
): Date {
  const start = fromDateKey(toDateKey(from));
  if (!Number.isFinite(days) || days === 0) return start;

  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(days));
  const cursor = new Date(start);

  // Limite de 10 anos: mais que isso é erro de entrada, não prazo.
  let guard = 0;
  while (remaining > 0 && guard < 3650) {
    cursor.setUTCDate(cursor.getUTCDate() + step);
    guard += 1;
    if (isBusinessDay(cursor, holidays)) remaining -= 1;
  }
  return cursor;
}

/**
 * Quantos dias úteis existem entre `from` e `to` (ambos inclusivos).
 * Retorna 0 quando a data final é anterior à inicial.
 */
export function countBusinessDays(
  from: Date | string,
  to: Date | string,
  holidays?: HolidayLike[] | null
): number {
  const start = fromDateKey(toDateKey(from));
  const end = fromDateKey(toDateKey(to));
  if (end.getTime() < start.getTime()) return 0;

  let count = 0;
  const cursor = new Date(start);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 3650) {
    if (isBusinessDay(cursor, holidays)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return count;
}

/**
 * Dias úteis que faltam até `dueDate` a partir de `from` (hoje não conta).
 * Negativo quando o prazo já passou (quantos dias úteis de atraso).
 */
export function businessDaysUntil(
  from: Date | string,
  dueDate: Date | string,
  holidays?: HolidayLike[] | null
): number {
  const start = fromDateKey(toDateKey(from));
  const end = fromDateKey(toDateKey(dueDate));
  if (end.getTime() < start.getTime()) {
    return -countBusinessDays(end, start, holidays);
  }
  return countBusinessDays(addBusinessDays(start, 1, holidays), end, holidays);
}
