export type AppointmentStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "CHECKED_IN" | "NO_SHOW";

/** Origem do agendamento (espelha o enum `AppointmentSource` do Prisma). */
export type AppointmentSource = "APP" | "PUBLIC" | "WHATSAPP_OWNER_BOT";

/** Modalidade do atendimento (espelha o enum `AppointmentModality` do Prisma). */
export type AppointmentModality = "IN_PERSON" | "VIDEO" | "PHONE";

export interface ICreateAppointmentDTO {
  barbershopId: string;
  serviceId: string;
  staffId?: string | null;
  clientId?: string | null;
  clientPackageId?: string | null;
  customerName: string;
  whatsapp: string;
  /** Formato ISO: "2026-06-20" */
  date: string;
  /** Formato "HH:MM": "10:30" */
  time: string;
  reservedProducts?: Array<{
    productId: string;
    quantity: number;
  }>;
  /** Pet escolhido (MVP petshop). O nome é resolvido pelo backend. */
  petId?: string | null;
  petName?: string | null;
  /**
   * Caso/processo escolhido (segmento LAW_FIRM). O apelido (`caseName`) é
   * resolvido pelo backend a partir do `caseId` — o cliente nunca informa o
   * snapshot. Dados de caso são internos: não vão para mensagens ao cliente,
   * perfil público ou assistente do WhatsApp.
   */
  caseId?: string | null;
  caseName?: string | null;
  /** Área de atuação (tag do escritório) que classifica o atendimento. */
  practiceArea?: string | null;
  /** Modalidade do atendimento: presencial, vídeo ou telefone. */
  modality?: AppointmentModality;
  /** Link da reunião online (opcional); entra no lembrete enviado ao cliente. */
  meetingLink?: string | null;
  /** Canal de origem — o assistente do dono no WhatsApp grava WHATSAPP_OWNER_BOT. */
  source?: AppointmentSource;
}

export interface IUpdateAppointmentDTO {
  staffId?: string | null;
  customerName?: string;
  whatsapp?: string;
  date?: string;
  time?: string;
  status?: AppointmentStatus;
  /** Reapontar o atendimento para outro caso do mesmo cliente. */
  caseId?: string | null;
  /** Snapshot do apelido do caso — resolvido no backend, nunca vem do cliente. */
  caseName?: string | null;
  /** Reclassificar o atendimento em outra área de atuação. */
  practiceArea?: string | null;
  modality?: AppointmentModality;
  meetingLink?: string | null;
}

export interface IAppointmentResponseDTO {
  id: string;
  barbershopId: string;
  barbershopName?: string | null;
  serviceId: string;
  serviceName: string | null;
  servicePrice: number | null;
  staffId: string | null;
  staffName: string | null;
  customerName: string;
  whatsapp: string;
  date: Date;
  time: string;
  status: AppointmentStatus;
  /** Canal de origem do agendamento. */
  source?: AppointmentSource;
  clientId?: string | null;
  clientPackageId?: string | null;
  petId?: string | null;
  petName?: string | null;
  /**
   * Caso/processo do atendimento (segmento LAW_FIRM). `caseName` é o snapshot
   * do apelido interno — dado interno, nunca enviado a mensagem do cliente.
   */
  caseId?: string | null;
  caseName?: string | null;
  practiceArea?: string | null;
  modality?: AppointmentModality;
  meetingLink?: string | null;
  /** Preenchido após o cron de lembrete diário enviar o WhatsApp */
  reminderSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reservedProducts?: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    imageUrl?: string | null;
  }>;
}

/**
 * Slot OCUPADO retornado por GET /appointments/availability.
 * O front calcula os horários livres a partir desta lista
 * (ver `isSlotAvailable` em agendai/src/utils/schedulingUtils.ts).
 */
export interface IAvailabilitySlotDTO {
  time: string;
  staffId: string | null;
  durationMinutes: number;
}

export interface IListAppointmentsQuery {
  page: number;
  limit: number;
  /** Filtrar por data específica (ISO "2026-06-20") */
  date?: string;
  /** Intervalo civil: início (inclusive) */
  from?: string;
  /** Intervalo civil: fim (inclusive) */
  to?: string;
  /** Filtrar por status */
  status?: AppointmentStatus;
  /** Filtrar por funcionário */
  staffId?: string;
  /** Busca por nome do cliente ou whatsapp */
  search?: string;
}
