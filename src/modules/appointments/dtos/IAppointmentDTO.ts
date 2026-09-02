export type AppointmentStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "CHECKED_IN" | "NO_SHOW";

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
  clientId?: string | null;
  clientPackageId?: string | null;
  /** Preenchido após o cron de lembrete diário enviar o WhatsApp */
  reminderSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  /** Filtrar por status */
  status?: AppointmentStatus;
  /** Filtrar por funcionário */
  staffId?: string;
  /** Busca por nome do cliente ou whatsapp */
  search?: string;
}
