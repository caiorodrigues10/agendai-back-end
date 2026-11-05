/**
 * Utilitários de validação de data para o backend.
 * Foco em agendamentos e regras de negócio de salão.
 */

function ymdInTimeZone(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Checa se a string é uma data calendário válida (YYYY-MM-DD) e corresponde a um Date real. */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Checa se a data é hoje ou futuro (em relação ao fuso informado). */
export function isNotPast(dateStr: string, tz = 'America/Sao_Paulo'): boolean {
  if (!isValidDate(dateStr)) return false;
  const today = ymdInTimeZone(new Date(), tz);
  return dateStr >= today;
}

/** Checa se a data não é muito distante no futuro (máx N dias a partir de hoje). */
export function isWithinHorizon(dateStr: string, maxDays = 60, tz = 'America/Sao_Paulo'): boolean {
  if (!isValidDate(dateStr)) return false;
  const todayStr = ymdInTimeZone(new Date(), tz);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const maxDate = new Date(Date.UTC(ty, tm - 1, td + maxDays));
  const maxStr = maxDate.toISOString().slice(0, 10);
  return dateStr <= maxStr;
}

/** Checa se HH:MM é um horário válido e dentro do intervalo permitido. */
export function isValidTime(timeStr: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return false;
  const [h, m] = timeStr.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** Checa se o horário está dentro do horário comercial (07:00–22:00). */
export function isBusinessHour(timeStr: string): boolean {
  if (!isValidTime(timeStr)) return false;
  const [h, m] = timeStr.split(':').map(Number);
  const minutes = h * 60 + m;
  return minutes >= 420 && minutes <= 1320; // 07:00–22:00
}

/**
 * Limites UTC do dia civil de uma data YYYY-MM-DD.
 *
 * `new Date("YYYY-MM-DD")` é interpretado no fuso local e desloca o
 * intervalo do dia, sumindo registros na virada. Os limites em UTC mantêm
 * o dia civil exato (convenção já usada no filtro por data de agendamentos).
 *
 * ⚠️ Use apenas para colunas `@db.Date` (a data não tem hora: o dia é o dia
 * em UTC). Para colunas `DateTime` (timestamp) use {@link civilDayBounds},
 * que respeita o fuso do salão.
 */
export function utcDayBounds(isoDate: string): { gte: Date; lt: Date } {
  const [year, month, day] = isoDate.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(year, month - 1, day)),
    lt: new Date(Date.UTC(year, month - 1, day + 1)),
  };
}

/** Fuso padrão do salão — mesmo default de `Barbershop.timezone`. */
export const DEFAULT_SHOP_TIMEZONE = "America/Sao_Paulo";

const civilFormatters = new Map<string, Intl.DateTimeFormat>();

/** Formatador de horário de parede do fuso; `null` quando o fuso é inválido. */
function civilFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = civilFormatters.get(timeZone);
  if (cached) return cached;

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    civilFormatters.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

interface CivilWallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Horário de parede (o que o relógio do salão mostra) de um instante. */
function civilWallClock(instant: Date, timeZone: string): CivilWallClock | null {
  const formatter = civilFormatter(timeZone);
  if (!formatter) return null;

  const parts = formatter.formatToParts(instant);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** Deslocamento do fuso (local - UTC) no instante informado, em ms. */
function civilOffsetMs(instant: Date, timeZone: string): number | null {
  const wall = civilWallClock(instant, timeZone);
  if (!wall) return null;

  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second
  );
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/**
 * Instante do início (00:00) do dia civil no fuso informado.
 *
 * Calculado por tentativa: o deslocamento do fuso é avaliado no instante
 * candidato e o resultado é conferido contra o horário de parede desejado.
 * Assim:
 * - dias normais → meia-noite local exata;
 * - virada de horário de verão → meia-noite local exata (o dia pode ter 23h
 *   ou 25h de duração);
 * - meia-noite inexistente (o relógio saltou de 23:59 para 01:00) → o próprio
 *   instante da virada, que é o primeiro segundo do dia.
 */
function civilStartOfDay(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date | null {
  const localAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);

  const firstOffset = civilOffsetMs(new Date(localAsUtc), timeZone);
  if (firstOffset === null) return null;

  let candidate = new Date(localAsUtc - firstOffset);

  const wall = civilWallClock(candidate, timeZone);
  if (!wall) return null;

  const isMidnight =
    wall.year === year &&
    wall.month === month &&
    wall.day === day &&
    wall.hour === 0 &&
    wall.minute === 0;
  if (isMidnight) return candidate;

  // O primeiro palpite caiu na hora errada (virada de horário de verão):
  // refaz com o deslocamento do próprio candidato.
  const ownOffset = civilOffsetMs(candidate, timeZone);
  if (ownOffset !== null) {
    const refined = new Date(localAsUtc - ownOffset);
    const refinedWall = civilWallClock(refined, timeZone);
    const stillSameDay =
      refinedWall !== null &&
      refinedWall.year === year &&
      refinedWall.month === month &&
      refinedWall.day === day;
    if (stillSameDay) return refined;
  }

  // A meia-noite local não existe (o relógio saltou): o candidato é o
  // primeiro instante do dia.
  return candidate;
}

/**
 * Limites do dia civil de uma data YYYY-MM-DD **no fuso do salão**.
 *
 * `gte` é a meia-noite local do dia e `lt` é a meia-noite local do dia
 * seguinte (exclusivo) — o último dia do intervalo entra inteiro.
 *
 * É o helper correto para colunas `DateTime` (timestamp): o dia civil é o do
 * salão, não o UTC. Fuso inválido ou ausente cai em
 * {@link DEFAULT_SHOP_TIMEZONE} ("America/Sao_Paulo").
 */
export function civilDayBounds(
  isoDate: string,
  timeZone: string | null | undefined = DEFAULT_SHOP_TIMEZONE
): { gte: Date; lt: Date } {
  const [year, month, day] = isoDate.split("-").map(Number);

  const zone =
    timeZone && civilFormatter(timeZone) ? timeZone : DEFAULT_SHOP_TIMEZONE;

  const gte =
    civilStartOfDay(year, month, day, zone) ??
    new Date(Date.UTC(year, month - 1, day));

  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const lt =
    civilStartOfDay(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      zone
    ) ?? new Date(Date.UTC(year, month - 1, day + 1));

  return { gte, lt };
}

/** Calcula a soma de tempo (HH:MM + minutos) e retorna HH:MM. */
export function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = ((Math.floor(total / 60) % 24) + 24) % 24;
  const nm = ((total % 60) + 60) % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** Checa se dois intervalos de tempo se sobrepõem. */
export function timesOverlap(
  startA: string, endA: string,
  startB: string, endB: string
): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const a1 = toMin(startA), a2 = toMin(endA);
  const b1 = toMin(startB), b2 = toMin(endB);
  return a1 < b2 && b1 < a2;
}
