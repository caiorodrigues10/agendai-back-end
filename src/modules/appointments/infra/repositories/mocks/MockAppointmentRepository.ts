import { IAppointmentRepository } from "@/modules/appointments/repositories/IAppointmentRepository";
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
  IAvailabilitySlotDTO,
  AppointmentStatus,
} from "@/modules/appointments/dtos/IAppointmentDTO";

/** YYYY-MM-DD no fuso America/Sao_Paulo (espelha o repositório Prisma). */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export class MockAppointmentRepository implements IAppointmentRepository {
  public appointments: IAppointmentResponseDTO[] = [];
  private seq = 1;

  async create(data: ICreateAppointmentDTO): Promise<IAppointmentResponseDTO> {
    const now = new Date();
    const entity: IAppointmentResponseDTO = {
      id: `appointment-${this.seq++}`,
      barbershopId: data.barbershopId,
      barbershopName: null,
      serviceId: data.serviceId,
      serviceName: null,
      servicePrice: null,
      staffId: data.staffId ?? null,
      staffName: null,
      customerName: data.customerName,
      whatsapp: data.whatsapp,
      date: new Date(data.date),
      time: data.time,
      status: "CONFIRMED",
      clientId: data.clientId ?? null,
      clientPackageId: data.clientPackageId ?? null,
      reminderSentAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.appointments.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IAppointmentResponseDTO | null> {
    return this.appointments.find((a) => a.id === id) ?? null;
  }

  async list(
    barbershopId: string,
    query: IListAppointmentsQuery
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }> {
    let results = this.appointments.filter(
      (a) => a.barbershopId === barbershopId
    );

    if (query.status) results = results.filter((a) => a.status === query.status);
    if (query.staffId) results = results.filter((a) => a.staffId === query.staffId);
    if (query.search) {
      const term = query.search.toLowerCase();
      results = results.filter(
        (a) =>
          a.customerName.toLowerCase().includes(term) ||
          a.whatsapp.includes(term)
      );
    }

    const total = results.length;
    const start = (query.page - 1) * query.limit;
    return { data: results.slice(start, start + query.limit), total };
  }

  async update(
    id: string,
    data: IUpdateAppointmentDTO
  ): Promise<IAppointmentResponseDTO> {
    const idx = this.appointments.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("Agendamento não encontrado");

    this.appointments[idx] = {
      ...this.appointments[idx],
      ...(data.customerName && { customerName: data.customerName }),
      ...(data.whatsapp && { whatsapp: data.whatsapp }),
      ...(data.date && { date: new Date(data.date) }),
      ...(data.time && { time: data.time }),
      ...(data.status && { status: data.status as AppointmentStatus }),
      ...(data.staffId !== undefined && { staffId: data.staffId }),
      updatedAt: new Date(),
    };

    return this.appointments[idx];
  }

  async delete(id: string): Promise<void> {
    const idx = this.appointments.findIndex((a) => a.id === id);
    if (idx >= 0) {
      this.appointments[idx] = {
        ...this.appointments[idx],
        status: "CANCELLED",
        updatedAt: new Date(),
      };
    }
  }

  async getOccupiedSlots(
    barbershopId: string,
    date: string,
    staffId?: string
  ): Promise<IAvailabilitySlotDTO[]> {
    const target = new Date(date).toDateString();
    return this.appointments
      .filter(
        (a) =>
          a.barbershopId === barbershopId &&
          a.status === "CONFIRMED" &&
          a.date.toDateString() === target &&
          (!staffId || !a.staffId || a.staffId === staffId)
      )
      .map((a) => ({
        time: a.time,
        staffId: a.staffId,
        durationMinutes: 30,
      }));
  }

  async findConfirmedForReminderToday(): Promise<IAppointmentResponseDTO[]> {
    // Janela do dia em America/Sao_Paulo, espelhando o AppointmentRepository
    // real (que usa gte/lt). Evita divergence de fuso em CI em UTC.
    const start = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return this.appointments.filter(
      (a) =>
        a.status === "CONFIRMED" &&
        !a.reminderSentAt &&
        a.date >= start &&
        a.date < end
    );
  }

  async markReminderSent(id: string): Promise<void> {
    const idx = this.appointments.findIndex((a) => a.id === id);
    if (idx >= 0) {
      this.appointments[idx] = {
        ...this.appointments[idx],
        reminderSentAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }
}
