import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IAppointmentRepository } from "../repositories/IAppointmentRepository";
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
  IAvailabilitySlotDTO,
} from "../dtos/IAppointmentDTO";

// ─── Create ───────────────────────────────────────────────────────────────────

@injectable()
export class CreateAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    data: ICreateAppointmentDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }
    return this.repo.create(data);
  }
}

// ─── Get ──────────────────────────────────────────────────────────────────────

@injectable()
export class GetAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return appointment;
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

@injectable()
export class ListAppointmentsUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    barbershopId: string,
    query: IListAppointmentsQuery,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return this.repo.list(barbershopId, query);
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

@injectable()
export class UpdateAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    id: string,
    data: IUpdateAppointmentDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    if (appointment.status === "CANCELLED") {
      throw new AppError("Agendamento cancelado não pode ser editado", 400);
    }

    return this.repo.update(id, data);
  }
}

// ─── Availability ─────────────────────────────────────────────────────────────

@injectable()
export class GetAvailabilityUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  /** Rota pública: retorna slots OCUPADOS do dia; o front calcula os livres. */
  async execute(
    barbershopId: string,
    date: string
  ): Promise<IAvailabilitySlotDTO[]> {
    return this.repo.getOccupiedSlots(barbershopId, date);
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

@injectable()
export class CancelAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    if (appointment.status === "CANCELLED") {
      throw new AppError("Agendamento já está cancelado", 409);
    }

    await this.repo.delete(id);
  }
}
