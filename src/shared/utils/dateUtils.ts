/**
 * Utilitários de validação de data para o backend.
 * Foco em agendamentos e regras de negócio de salão.
 */

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
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return dateStr >= today;
}

/** Checa se a data não é muito distante no futuro (máx N dias a partir de hoje). */
export function isWithinHorizon(dateStr: string, maxDays = 60, tz = 'America/Sao_Paulo'): boolean {
  if (!isValidDate(dateStr)) return false;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + maxDays);
  const maxStr = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}-${String(maxDate.getDate()).padStart(2, '0')}`;
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

/** Calcula a soma de tempo (HH:MM + minutos) e retorna HH:MM. */
export function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
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
