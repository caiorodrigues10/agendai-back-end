export type AppointmentStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface ICreateAppointmentDTO {
  barbershopId: string;
  serviceId: string;
  staffId?: string | null;
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
  createdAt: Date;
  updatedAt: Date;
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
