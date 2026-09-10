import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  upsertScheduleSchema,
  assignServiceSchema,
  requestTimeOffSchema,
} from "./staffSchema";
import type { z } from "zod";

type UpsertScheduleInput = z.infer<typeof upsertScheduleSchema>;
type AssignServiceInput = z.infer<typeof assignServiceSchema>;
type RequestTimeOffInput = z.infer<typeof requestTimeOffSchema>;

const scheduleSelect = {
  id: true,
  barbershopId: true,
  staffId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  staff: { select: { id: true, name: true, email: true } },
} as const;

const serviceSelect = {
  id: true,
  barbershopId: true,
  staffId: true,
  serviceId: true,
  customPrice: true,
  customTime: true,
  isActive: true,
  createdAt: true,
  staff: { select: { id: true, name: true, email: true } },
  service: { select: { id: true, name: true, price: true, durationMinutes: true } },
} as const;

const timeOffSelect = {
  id: true,
  barbershopId: true,
  staffId: true,
  startAt: true,
  endAt: true,
  reason: true,
  status: true,
  approvedById: true,
  createdAt: true,
  staff: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true } },
} as const;

export class StaffRepository {
  // ─── Schedules ────────────────────────────────────────────────
  async listSchedules(barbershopId: string, staffId?: string) {
    return prisma.staffSchedule.findMany({
      where: {
        barbershopId,
        ...(staffId ? { staffId } : {}),
      },
      select: scheduleSelect,
      orderBy: [{ staffId: "asc" }, { dayOfWeek: "asc" }],
    });
  }

  async findScheduleById(id: string) {
    return prisma.staffSchedule.findUnique({
      where: { id },
      select: scheduleSelect,
    });
  }

  async upsertSchedule(barbershopId: string, data: UpsertScheduleInput) {
    const existing = await prisma.staffSchedule.findUnique({
      where: {
        barbershopId_staffId_dayOfWeek: {
          barbershopId,
          staffId: data.staffId,
          dayOfWeek: data.dayOfWeek,
        },
      },
    });

    if (existing) {
      return prisma.staffSchedule.update({
        where: { id: existing.id },
        data: {
          startTime: data.startTime,
          endTime: data.endTime,
          isActive: data.isActive,
        },
        select: scheduleSelect,
      });
    }

    return prisma.staffSchedule.create({
      data: {
        barbershopId,
        staffId: data.staffId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        isActive: data.isActive,
      },
      select: scheduleSelect,
    });
  }

  async deleteSchedule(id: string, barbershopId: string) {
    const existing = await prisma.staffSchedule.findUnique({ where: { id } });
    if (!existing) throw new AppError("Agenda não encontrada", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }

    await prisma.staffSchedule.delete({ where: { id } });
  }

  // ─── Services ─────────────────────────────────────────────────
  async listServices(barbershopId: string, staffId?: string) {
    return prisma.staffService.findMany({
      where: {
        barbershopId,
        ...(staffId ? { staffId } : {}),
      },
      select: serviceSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findServiceById(id: string) {
    return prisma.staffService.findUnique({
      where: { id },
      select: serviceSelect,
    });
  }

  async assignService(barbershopId: string, data: AssignServiceInput) {
    const existing = await prisma.staffService.findUnique({
      where: {
        barbershopId_staffId_serviceId: {
          barbershopId,
          staffId: data.staffId,
          serviceId: data.serviceId,
        },
      },
    });

    if (existing) {
      return prisma.staffService.update({
        where: { id: existing.id },
        data: {
          customPrice: data.customPrice ?? null,
          customTime: data.customTime ?? null,
          isActive: data.isActive,
        },
        select: serviceSelect,
      });
    }

    return prisma.staffService.create({
      data: {
        barbershopId,
        staffId: data.staffId,
        serviceId: data.serviceId,
        customPrice: data.customPrice ?? null,
        customTime: data.customTime ?? null,
        isActive: data.isActive,
      },
      select: serviceSelect,
    });
  }

  async removeService(barbershopId: string, staffId: string, serviceId: string) {
    const existing = await prisma.staffService.findUnique({
      where: {
        barbershopId_staffId_serviceId: {
          barbershopId,
          staffId,
          serviceId,
        },
      },
    });
    if (!existing) throw new AppError("Serviço do funcionário não encontrado", 404);

    await prisma.staffService.delete({ where: { id: existing.id } });
  }

  // ─── Time Off ─────────────────────────────────────────────────
  async listTimeOff(barbershopId: string, staffId?: string, status?: string) {
    return prisma.staffTimeOff.findMany({
      where: {
        barbershopId,
        ...(staffId ? { staffId } : {}),
        ...(status ? { status: status.toUpperCase() as any } : {}),
      },
      select: timeOffSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findTimeOffById(id: string) {
    return prisma.staffTimeOff.findUnique({
      where: { id },
      select: timeOffSelect,
    });
  }

  async requestTimeOff(barbershopId: string, data: RequestTimeOffInput) {
    return prisma.staffTimeOff.create({
      data: {
        barbershopId,
        staffId: data.staffId,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        reason: data.reason ?? null,
      },
      select: timeOffSelect,
    });
  }

  async approveTimeOff(id: string, approvedById: string) {
    const existing = await prisma.staffTimeOff.findUnique({ where: { id } });
    if (!existing) throw new AppError("Solicitação de folga não encontrada", 404);

    return prisma.staffTimeOff.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById,
      },
      select: timeOffSelect,
    });
  }

  async rejectTimeOff(id: string) {
    const existing = await prisma.staffTimeOff.findUnique({ where: { id } });
    if (!existing) throw new AppError("Solicitação de folga não encontrada", 404);

    return prisma.staffTimeOff.update({
      where: { id },
      data: {
        status: "REJECTED",
      },
      select: timeOffSelect,
    });
  }
}
