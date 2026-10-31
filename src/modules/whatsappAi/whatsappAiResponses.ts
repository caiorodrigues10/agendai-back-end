import { normalizeAiText, type AiIntent } from "./whatsappAiIntent";
import type { AiSalonContext, AiSalonSchedule, AiSalonService } from "./whatsappAi.types";

/**
 * Respostas do atendente de IA.
 *
 * Tudo aqui é montado a partir dos dados REAIS do salão (endereço, quadro de
 * horários, serviços e preços). A versão anterior respondia com dados fixos
 * ("Rua Principal, 123", "9h às 20h") — isso era misinformation para o
 * cliente e não podia continuar.
 */

const WEEKDAY_NAMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MAX_SERVICES_IN_REPLY = 8;

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatAiPrice(value: number): string {
  if (!Number.isFinite(value)) return "a combinar";
  return currency.format(value);
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const [h, m] = value.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour)) return value;
  if (!m || m === "00") return `${hour}h`;
  return `${hour}h${m}`;
}

/** Agrupa dias consecutivos que abrem no mesmo horário. */
export function formatAiSchedule(schedules: AiSalonSchedule[]): string[] {
  const byDay = new Map<number, AiSalonSchedule>();
  for (const schedule of schedules) byDay.set(schedule.dayOfWeek, schedule);

  const lines: string[] = [];
  let groupStart: number | null = null;
  let groupEnd: number | null = null;
  let groupSignature = "";

  const flush = () => {
    if (groupStart === null || groupEnd === null) return;
    const open = byDay.get(groupStart);
    if (!open) return;
    const label =
      groupStart === groupEnd
        ? WEEKDAY_NAMES[groupStart]
        : `${WEEKDAY_SHORT[groupStart]} a ${WEEKDAY_SHORT[groupEnd]}`;
    lines.push(`${label}: ${formatTime(open.openTime)} às ${formatTime(open.closeTime)}`);
    groupStart = null;
    groupEnd = null;
    groupSignature = "";
  };

  for (let day = 0; day < 7; day++) {
    const schedule = byDay.get(day);
    if (!schedule || !schedule.isOpen) {
      flush();
      continue;
    }
    const signature = `${schedule.openTime}-${schedule.closeTime}`;
    if (groupStart === null) {
      groupStart = day;
      groupEnd = day;
      groupSignature = signature;
      continue;
    }
    if (signature !== groupSignature) {
      flush();
      groupStart = day;
      groupEnd = day;
      groupSignature = signature;
      continue;
    }
    groupEnd = day;
  }
  flush();

  return lines;
}

/** Serviço citado na mensagem (o nome mais longo que aparecer no texto). */
export function matchAiService(
  message: string | null | undefined,
  services: AiSalonService[]
): AiSalonService | null {
  const normalized = normalizeAiText(message);
  if (!normalized) return null;

  let match: AiSalonService | null = null;
  let matchLength = 0;
  for (const service of services) {
    const normalizedName = normalizeAiText(service.name);
    if (!normalizedName) continue;
    if (normalized.includes(normalizedName) && normalizedName.length > matchLength) {
      match = service;
      matchLength = normalizedName.length;
    }
  }
  return match;
}

function hoursReply(salon: AiSalonContext): string {
  const lines = formatAiSchedule(salon.schedules);
  if (lines.length === 0) {
    return `Não tenho o quadro de horários cadastrado aqui. Chame um atendente que te passa na hora! 📅`;
  }

  const closedNow =
    salon.manualStatus === "CLOSED" || (salon.openingMode === "MANUAL" && salon.manualStatus !== "OPEN");

  const status = closedNow ? "No momento estamos fechados." : "Nosso horário de funcionamento:";
  return `${status}\n\n${lines.map((line) => `📅 ${line}`).join("\n")}`;
}

function locationReply(salon: AiSalonContext): string {
  const address = salon.address?.trim();
  const city = salon.city?.trim();

  if (!address && !city) {
    return `Ainda não tenho o endereço cadastrado. Peça para um atendente te enviar a localização! 📍`;
  }

  const lines: string[] = [];
  if (address) lines.push(address);
  if (city) lines.push(city);

  let reply = `Estamos em:\n${lines.map((line) => `📍 ${line}`).join("\n")}`;

  if (salon.latitude !== null && salon.longitude !== null) {
    const map = `https://www.google.com/maps/search/?api=1&query=${salon.latitude},${salon.longitude}`;
    reply += `\n\n📌 No mapa: ${map}`;
  }

  return reply;
}

function pricingReply(salon: AiSalonContext, matched: AiSalonService | null): string {
  if (salon.services.length === 0) {
    return `Tenho a tabela de preços, mas ela ainda não foi cadastrada aqui. Quer que um atendente te envie? 💰`;
  }

  if (matched) {
    const others = salon.services
      .filter((service) => service.name !== matched.name)
      .slice(0, MAX_SERVICES_IN_REPLY - 1);
    const lines = [
      `${matched.name}: ${formatAiPrice(matched.price)}`,
      ...others.map((service) => `${service.name}: ${formatAiPrice(service.price)}`),
    ];
    return `Aqui está a nossa tabela:\n\n${lines.map((line) => `💰 ${line}`).join("\n")}`;
  }

  const lines = salon.services
    .slice(0, MAX_SERVICES_IN_REPLY)
    .map((service) => `${service.name}: ${formatAiPrice(service.price)}`);

  const extra =
    salon.services.length > MAX_SERVICES_IN_REPLY
      ? `\n\n(e mais ${salon.services.length - MAX_SERVICES_IN_REPLY} serviços — pergunte por um!)`
      : "";

  return `Aqui está a nossa tabela:\n\n${lines.map((line) => `💰 ${line}`).join("\n")}${extra}`;
}

function greetingReply(salon: AiSalonContext): string {
  return `Olá! 👋 Aqui é o ${salon.name}. Posso te ajudar com:\n\n📅 Agendamento\n💰 Preços\n🕐 Horário de funcionamento\n📍 Endereço\n\nÉ só perguntar!`;
}

function unknownReply(salon: AiSalonContext): string {
  return `Não entendi bem essa mensagem 😅\n\nPosso te ajudar com:\n\n📅 Agendamento\n💰 Preços\n🕐 Horário de funcionamento\n📍 Endereço\n\nSe preferir, chame um atendente: responda "atendente".`;
}

export type BuildAiResponseInput = {
  intent: AiIntent;
  salon: AiSalonContext;
  message?: string | null;
};

/** Monta a resposta da IA para a intenção detectada. */
export function buildAiResponse({ intent, salon, message }: BuildAiResponseInput): string {
  const matchedService = matchAiService(message, salon.services);

  switch (intent) {
    case "greeting":
      return greetingReply(salon);
    case "hours":
      return hoursReply(salon);
    case "location":
      return locationReply(salon);
    case "pricing":
      return pricingReply(salon, matchedService);
    case "scheduling":
      return `Que ótimo que quer agendar! 😊 Para montar o horário me diga:\n\n1️⃣ Serviço\n2️⃣ Dia\n3️⃣ Período (manhã/tarde/noite)\n\nUm atendente do ${salon.name} confirma para você.`;
    case "reschedule":
      return `Sem problema! Me diga o serviço e o horário atual que um atendente do ${salon.name} remarca para você.`;
    case "human_transfer":
      return `Entendi! Vou te encaminhar para um atendente do ${salon.name} agora mesmo. 💬`;
    case "farewell":
      return `Obrigado pelo contato! Foi ótimo te atender. Qualquer coisa é só chamar! Até mais! 👋`;
    default:
      return unknownReply(salon);
  }
}
