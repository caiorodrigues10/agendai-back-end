import { StaffRepository } from "./staffRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type {
  upsertScheduleSchema,
  assignServiceSchema,
  requestTimeOffSchema,
  timeOffQuerySchema,
} from "./staffSchema";

type UpsertScheduleInput = z.infer<typeof upsertScheduleSchema>;
type AssignServiceInput = z.infer<typeof assignServiceSchema>;
type RequestTimeOffInput = z.infer<typeof requestTimeOffSchema>;
type TimeOffQuery = z.infer<typeof timeOffQuerySchema>;

export class StaffUseCases {
  private repo = new StaffRepository();

  // ─── Schedules ────────────────────────────────────────────────
  async listSchedules(barbershopId: string, staffId?: string) {
    return this.repo.listSchedules(barbershopId, staffId);
  }

  async upsertSchedule(barbershopId: string, data: UpsertScheduleInput) {
    return this.repo.upsertSchedule(barbershopId, data);
  }

  async deleteSchedule(scheduleId: string, barbershopId: string) {
    await this.repo.deleteSchedule(scheduleId, barbershopId);
  }

  // ─── Services ─────────────────────────────────────────────────
  async listServices(barbershopId: string, staffId?: string) {
    return this.repo.listServices(barbershopId, staffId);
  }

  async assignService(barbershopId: string, data: AssignServiceInput) {
    return this.repo.assignService(barbershopId, data);
  }

  async removeService(barbershopId: string, staffId: string, serviceId: string) {
    return this.repo.removeService(barbershopId, staffId, serviceId);
  }

  // ─── Time Off ─────────────────────────────────────────────────
  async listTimeOff(barbershopId: string, query: TimeOffQuery) {
    return this.repo.listTimeOff(barbershopId, query.staffId, query.status);
  }

  async requestTimeOff(barbershopId: string, data: RequestTimeOffInput) {
    return this.repo.requestTimeOff(barbershopId, data);
  }

  async approveTimeOff(id: string, barbershopId: string, approvedById: string) {
    const existing = await this.repo.findTimeOffById(id);
    if (!existing) throw new AppError("Solicitação de folga não encontrada", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    if (existing.status !== "PENDING") {
      throw new AppError("Solicitação já foi processada", 400);
    }
    return this.repo.approveTimeOff(id, approvedById);
  }

  async rejectTimeOff(id: string, barbershopId: string) {
    const existing = await this.repo.findTimeOffById(id);
    if (!existing) throw new AppError("Solicitação de folga não encontrada", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    if (existing.status !== "PENDING") {
      throw new AppError("Solicitação já foi processada", 400);
    }
    return this.repo.rejectTimeOff(id);
  }
}
