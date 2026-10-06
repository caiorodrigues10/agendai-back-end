/**
 * Regras puras do alerta de atraso (L1/L2/L3) — sem IO, totalmente testáveis.
 *
 * Decisões de produto (rodada 2026-10-05):
 * - "Atrasado" = agendamento CONFIRMED cujo horário civil passou e continua sem check-in.
 * - Cadência normal: L1 na tolerância da policy (default 15min), L2 aos 30min,
 *   L3 quando o salão fecha (com link de remarcação de 14d).
 * - Modo impaciente: nos últimos 60 min antes do closeTime, L1/L2 antecipam 5 min
 *   (10/25) e a cópia fica mais curta, citando o fechamento.
 * - Depois de L3 (ou após a janela de fechamento), silêncio — NO_SHOW é manual.
 */

export type LateAlertLevel = 0 | 1 | 2 | 3;

/** Janela antes do fechamento em que o alerta fica impaciente. */
export const LATE_IMPATIENT_WINDOW_MINUTES = 60;
/** L3 só dispara dentro desta janela após o fechamento — depois disso não incomodamos. */
export const LATE_AFTER_CLOSE_GRACE_MINUTES = 30;
/** Atraso absoluto da segunda mensagem (não vem da policy). */
export const LATE_SECOND_ALERT_MINUTES = 30;
/** Quanto o modo impaciente antecipa L1/L2. */
export const IMPATIENT_ADVANCE_MINUTES = 5;

export interface LateAlertInput {
  now: Date;
  /** Instante (UTC real) do horário civil do agendamento. */
  appointmentAt: Date;
  /** Tolerância do 1º alerta (AppointmentPolicy.lateToleranceMinutes). */
  toleranceMinutes: number;
  /** Instante do fechamento do salão hoje; null quando fechado/sem schedule. */
  closeAt: Date | null;
}

export function resolveLateAlertLevel(input: LateAlertInput): LateAlertLevel {
  const { now, appointmentAt, closeAt } = input;

  // Fechamento: L3 vale só para agendamento no horário do expediente, numa
  // janela curta pós-fecho — fora dela, ninguém recebe nada.
  if (closeAt && now.getTime() >= closeAt.getTime()) {
    const afterClose = (now.getTime() - closeAt.getTime()) / 60_000;
    if (appointmentAt.getTime() < closeAt.getTime() && afterClose <= LATE_AFTER_CLOSE_GRACE_MINUTES) return 3;
    return 0;
  }
  if (now.getTime() < appointmentAt.getTime()) return 0;

  const lateMinutes = (now.getTime() - appointmentAt.getTime()) / 60_000;
  const impatient =
    !!closeAt &&
    closeAt.getTime() - now.getTime() <= LATE_IMPATIENT_WINDOW_MINUTES * 60_000;

  const firstAt = input.toleranceMinutes - (impatient ? IMPATIENT_ADVANCE_MINUTES : 0);
  const secondAt = LATE_SECOND_ALERT_MINUTES - (impatient ? IMPATIENT_ADVANCE_MINUTES : 0);

  if (lateMinutes >= secondAt) return 2;
  if (lateMinutes >= firstAt) return 1;
  return 0;
}

export function lateAlertDedupKey(level: 1 | 2 | 3, appointmentId: string): string {
  return `late${level}:${appointmentId}`;
}

/**
 * Converte uma data/hora CIVIL num fuso IANA ("2026-10-05" + "19:30" +
 * "America/Sao_Paulo") para o instante absoluto. Não usar `Date.parse` com
 * offset fixo (funcionaria só em SP/SRT-free) nem o fuso do processo.
 */
export function civilInstantInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const civilUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = civilUtc;
  // Duas passadas bastam: o offset muda somente em transições de DST,
  // e o Brasil não tem DST desde 2019.
  for (let i = 0; i < 2; i++) {
    guess = civilUtc - tzOffsetMinutes(new Date(guess), timeZone) * 60_000;
  }
  return new Date(guess);
}

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUtc - at.getTime()) / 60_000;
}

/** Dia da semana (0=domingo) da data civil yyyy-mm-dd — independe do fuso. */
export function civilDayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export interface LateMessageContext {
  customerName: string;
  shopName: string;
  serviceName: string;
  /** Horário prometido, ex.: "19:30". */
  scheduledTime: string;
  /** Atraso em minutos (arredondado). */
  lateMinutes: number;
  /** Horário de fechamento civil, ex.: "20:00" (presente no modo impaciente). */
  closeTime?: string | null;
  /** Link de remarcação — só entra na mensagem de fechamento (L3). */
  manageUrl?: string | null;
}

/** Mensagem do CLIENTE por nível; `impatient` só faz sentido em L1/L2. */
export function buildLateClientMessage(level: 1 | 2 | 3, ctx: LateMessageContext, impatient: boolean): string {
  const shop = ctx.shopName.trim() || "o salão";
  const service = ctx.serviceName.trim() || "atendimento";

  if (level === 3) {
    return (
      `Oi, ${ctx.customerName}. 😔\n\n` +
      `O *${shop}* acabou de fechar o expediente e seu horário das *${ctx.scheduledTime}* (${service}) ficou para trás.\n\n` +
      `Remarque em um toque, sem precisar ligar:\n${ctx.manageUrl}\n\n` +
      `Te esperamos na próxima!`
    );
  }

  if (level === 1) {
    if (impatient) {
      return (
        `${ctx.customerName}, seu horário das *${ctx.scheduledTime}* na *${shop}* já passou.\n\n` +
        `Precisamos de você na cadeira agora — o salão fecha às *${ctx.closeTime}* e a agenda vai rodando. ` +
        `Se não vier, sua vaga pode ser reorganizada.`
      );
    }
    return (
      `Olá, ${ctx.customerName}! ⏰\n\n` +
      `Notamos um atraso no seu horário das *${ctx.scheduledTime}* na *${shop}* (${service}). ` +
      `Se ainda vier, chegue nos próximos minutos para manter seu atendimento.`
    );
  }

  // level 2
  if (impatient) {
    return (
      `${ctx.customerName}, são *${ctx.lateMinutes} min* de atraso e fechamos às *${ctx.closeTime}*.\n\n` +
      `Sem sua confirmação agora, precisaremos reorganizar a sua vaga na *${shop}*.`
    );
  }
  return (
    `${ctx.customerName}, já são *${ctx.lateMinutes} min* de atraso na *${shop}* (${service}).\n\n` +
    `Para não perder a vaga, confirme que está chegando. A partir daí vamos precisar reorganizar a agenda.`
  );
}

/** Versão operacional para o DONO do salão (ação no painel, não mensagem de cliente). */
export function buildLateStaffMessage(level: 1 | 2 | 3, ctx: LateMessageContext): string {
  const service = ctx.serviceName.trim() || "atendimento";
  const headLine =
    level === 3 ? "salão fechado com cliente em atraso" :
    level === 2 ? `atraso grave (${ctx.lateMinutes} min)` :
    `atraso de ${ctx.lateMinutes} min`;
  return (
    `⚠️ *Cliente atrasado — ${headLine}*\n\n` +
    `*${ctx.customerName}* tinha horário às *${ctx.scheduledTime}* (${service}) e ainda não apareceu.\n` +
    (level === 3
      ? `O expediente fechou. Considere marcar NO_SHOW no painel ou chamar o cliente.`
      : `Se não chegar, pode marcar NO_SHOW no painel da agenda.`)
  );
}
