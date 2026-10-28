export type AppointmentStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "CHECKED_IN" | "NO_SHOW";

/** Origem do agendamento (espelha o enum `AppointmentSource` do Prisma). */
export type AppointmentSource = "APP" | "PUBLIC" | "WHATSAPP_OWNER_BOT";

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
  /** Pet escolhido (MVP petshop). O nome é resolvido no backend. */
  petId?: string | null;
  petName?: string | null;
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
