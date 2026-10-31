import type { AiIntent } from "./whatsappAiIntent";

/**
 * Contexto público do salão — o que o atendente de IA pode contar.
 * Nada de endereço ou horário "de exemplo": tudo vem do banco.
 */

export type AiSalonSchedule = {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
};

export type AiSalonService = {
  name: string;
  price: number;
  avgTimeMinutes: number;
};

export type AiSalonContext = {
  id: string;
  name: string;
  whatsapp: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  businessSegment: string;
  openingMode: string;
  manualStatus: string;
  schedules: AiSalonSchedule[];
  services: AiSalonService[];
};

/** Salão que o atendente pode atender (vínculo do cliente). */
export type AiResolvedSalon = {
  id: string;
  name: string;
  source: "client_link" | "client_crm" | "instance";
};

export type AiInboundMessage = {
  messageId: string;
  phone: string;
  text: string;
  instanceName?: string;
};

export type AiHandleOutcome =
  | {
      status: "answered";
      conversationId: string;
      intent: AiIntent;
      confidence: number;
      reply: string;
    }
  | { status: "clarify_shop"; options: AiResolvedSalon[] }
  | { status: "shop_selected"; conversationId: string; salonId: string; reply: string }
  | { status: "ignored"; reason: string };
