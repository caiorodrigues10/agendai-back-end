import type { OwnerBotSegmentProfile } from "./types";

/**
 * Textos do assistente. Tudo em texto simples (WhatsApp), sem markdown —
 * o dono lê no celular, em tela pequena.
 */

export const OWNER_BOT_MESSAGES = {
  welcome: (shopName: string, ownerName: string) =>
    `Olá ${ownerName}! 👋 Sou o assistente do ${shopName} no WhatsApp.\n\n` +
    `Posso ver a agenda, agendar, cancelar, remarcar, fazer check-in, encerrar atendimento e marcar falta.\n\n` +
    `Para ver o que dá para fazer, envie "ajuda".`,

  help: (shopName: string, profile: OwnerBotSegmentProfile, extraLines: string[] = []) =>
    [
      `Comandos do assistente do ${shopName}:`,
      "",
      "*agendar* — criar um horário",
      "*agenda* — ver os horários de hoje",
      "*cancelar* — cancelar um horário",
      "*remarcar* — mudar data ou hora",
      "*check-in* — registrar a chegada do cliente",
      "*encerrar* — finalizar o atendimento e chamar o próximo",
      "*falta* — marcar que o cliente não compareceu",
      "*encaixe* — colocar alguém na fila agora",
      "*ajuda* — mostrar esta lista",
      ...extraLines,
      "",
      "Responda com o número da opção ou escreva o que precisa.",
    ].join("\n"),

  notLinked: () =>
    "Este número ainda não está vinculado a um estabelecimento.\n" +
    "Peça o código de vínculo em Configurações > Assistente no WhatsApp e envie aqui no formato: VINCULAR 123456.",

  notLinkedQuiet: () =>
    "Para usar o assistente, envie o código de vínculo: VINCULAR 123456",

  linkInvalidCode: () =>
    "Código inválido ou expirado. Peça um novo código em Configurações > Assistente no WhatsApp.",

  linkTooManyAttempts: () =>
    "Muitas tentativas com códigos inválidos. Peça um novo código em Configurações > Assistente no WhatsApp.",

  linkPhoneMismatch: (masked: string) =>
    `Este código é de outro número. O número cadastrado no estabelecimento termina em ${masked}. ` +
    "Envie o código usando o WhatsApp cadastrado.",

  linkSuccess: (shopName: string, ownerName: string, masked: string) =>
    `Pronto! ${ownerName}, este número (${masked}) foi vinculado ao ${shopName}.\n\n` +
    `Agora você pode pedir: "agenda", "agendar", "check-in", "encerrar" e mais. Envie "ajuda" para ver tudo.`,

  alreadyLinked: (shopName: string) =>
    `Este número já está vinculado ao ${shopName}. Envie "ajuda" para ver o que posso fazer.`,

  subscriptionBlocked: () =>
    "Seu plano está sem acesso ativo. Regularize a assinatura para usar o assistente por aqui.",

  unlinked: () =>
    "Vínculo desfeito. Você pode vincular de novo quando quiser, pelo código em Configurações > Assistente no WhatsApp.",

  switchShop: (shopName: string) => `Agora estou falando com o ${shopName}.`,

  activeShop: (shopName: string) => `Estabelecimento ativo: ${shopName}`,

  cancelledFlow: () => "Tudo bem, cancelei. Me chame de novo quando precisar.",

  unknown: () =>
    "Não entendi essa mensagem. Envie \"ajuda\" para ver os comandos disponíveis.",

  evolutionOffline: () =>
    "O WhatsApp da plataforma está indisponível agora. Tente novamente em alguns instantes.",

  agendaEmpty: () =>
    "Não há horários na agenda de hoje. Quer agendar um? Envie \"agendar\".",

  agendaHeader: (shopName: string, label: string) => `Agenda de ${shopName} — ${label}:`,

  agendaItem: (
    index: number,
    time: string,
    clientName: string,
    serviceName: string,
    status: string
  ) => `${index}. ${time} — ${clientName} (${serviceName}) [${status}]`,

  servicesHeader: (serviceNoun: string) => `Qual ${serviceNoun}? Responda com o número:`,

  serviceItem: (index: number, name: string) => `${index}. ${name}`,

  appointmentsHeader: (actionLabel: string) =>
    `Qual horário você quer ${actionLabel}? Responda com o número:`,

  appointmentItem: (
    index: number,
    time: string,
    clientName: string,
    serviceName: string
  ) => `${index}. ${time} — ${clientName} (${serviceName})`,

  askDate: () =>
    'Para que dia? Responda "hoje", "amanha" ou no formato dd/mm (ex.: 28/10).',

  askTime: () => "Que horas? Responda no formato 14:30.",

  askClientName: () => "Qual o nome do cliente?",

  askClientPhone: () =>
    "Qual o WhatsApp do cliente? Responda com o DDD e o número (ex.: 11999999999).",

  askAuxiliary: (kind: "pet" | "vehicle") =>
    kind === "pet" ? "Qual o nome do pet?" : "Qual a placa do veículo?",

  askConfirmation: (summary: string) =>
    `${summary}\n\nConfirma? Responda 1-Sim ou 2-Nao.`,

  confirmed: (summary: string) => `Pronto! ${summary}`,

  scheduleSuccess: (
    clientName: string,
    dateLabel: string,
    time: string,
    serviceName: string
  ) =>
    `Agendado! ${clientName} — ${serviceName}, ${dateLabel} às ${time}.`,

  cancelSuccess: (summary: string) => `Horário cancelado: ${summary}`,

  rescheduleSuccess: (summary: string) => `Horário remarcado: ${summary}`,

  checkInSuccess: (summary: string) => `Check-in registrado: ${summary}`,

  completeSuccess: (summary: string) => `Atendimento encerrado: ${summary}`,

  noShowSuccess: (summary: string) => `Falta registrada: ${summary}`,

  walkInSuccess: (summary: string) => `Cliente na fila: ${summary}`,

  nextClient: (summary: string | null) =>
    summary
      ? `Próximo da fila: ${summary}. Envie "check-in" para chamar.`
      : "Não há mais ninguém na fila por enquanto.",

  slotUnavailable: () =>
    "Esse horário não está disponível. Escolha outro horário ou envie \"agenda\" para ver a agenda.",

  serviceRequired: () => "Escolha um serviço da lista (respondendo com o número).",

  appointmentRequired: () => "Escolha um horário da lista (respondando com o número).",

  invalidSelection: () => "Não encontrei essa opção. Responda com um número da lista.",
} as const;

/** Rótulo de data em pt-BR a partir de "YYYY-MM-DD". */
export function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

/** Rótulo de dia relativo ("hoje", "amanhã"). */
export function formatRelativeDateLabel(isoDate: string, todayIso: string): string {
  const tomorrow = new Date(`${todayIso}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (isoDate === todayIso) return "hoje";
  if (isoDate === tomorrow.toISOString().slice(0, 10)) return "amanhã";
  return formatDateLabel(isoDate);
}

/** Máscara de telefone para exibição: (11) 99999-9999. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 4) {
    return `***${digits.slice(-4)}`;
  }
  return "***";
}
