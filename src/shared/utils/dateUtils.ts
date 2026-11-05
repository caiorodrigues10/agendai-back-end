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
 */
export function utcDayBounds(isoDate: string): { gte: Date; lt: Date } {
  const [year, month, day] = isoDate.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(year, month - 1, day)),
    lt: new Date(Date.UTC(year, month - 1, day + 1)),
  };
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
