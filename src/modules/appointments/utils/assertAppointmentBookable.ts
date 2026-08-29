import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { assertPublicShopOperationalAccess } from "@/shared/utils/assertPublicShopOperationalAccess";
import type { ICreateAppointmentDTO } from "../dtos/IAppointmentDTO";

type DbClient = Prisma.TransactionClient | typeof prisma;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
): boolean {
  const endA = startA + durationA;
  const endB = startB + durationB;
  return startA < endB && startB < endA;
}

export async function countEligibleStaff(
  barbershopId: string,
  db: DbClient = prisma
): Promise<number> {
  return db.user.count({
    where: {
      barbershopId,
      active: true,
      role: { in: ["OWNER", "EMPLOYEE"] },
    },
  });
}

/**
 * Valida integridade de booking (público ou staff) e retorna duração do serviço.
 * Preferir chamar dentro de `prisma.$transaction`.
 */
export async function assertAppointmentBookable(
  data: ICreateAppointmentDTO,
  db: DbClient = prisma
): Promise<{ durationMinutes: number }> {
  await assertPublicShopOperationalAccess(data.barbershopId);

  const service = await db.service.findFirst({
    where: {
      id: data.serviceId,
      barbershopId: data.barbershopId,
      active: true,
    },
    select: { id: true, avgTimeMinutes: true },
  });
  if (!service) {
    throw new AppError("Serviço inválido para este estabelecimento", 400);
  }

  if (data.staffId) {
    const staff = await db.user.findFirst({
      where: {
        id: data.staffId,
        barbershopId: data.barbershopId,
        active: true,
        role: { in: ["OWNER", "EMPLOYEE"] },
      },
      select: { id: true },
    });
    if (!staff) {
      throw new AppError(
        "Profissional inválido para este estabelecimento",
        400
      );
    }
  } else {
    const eligible = await countEligibleStaff(data.barbershopId, db);
    if (eligible === 0) {
      throw new AppError(
        "Nenhum profissional disponível neste estabelecimento",
        409
      );
    }
  }

  const day = new Date(data.date);
  const dayOfWeek = day.getUTCDay();
  const schedule = await db.schedule.findUnique({
    where: {
      barbershopId_dayOfWeek: {
        barbershopId: data.barbershopId,
        dayOfWeek,
      },
    },
  });

  if (schedule) {
    if (!schedule.isOpen) {
      throw new AppError("Estabelecimento fechado neste dia", 400);
    }
    const slot = timeToMinutes(data.time);
    const open = timeToMinutes(schedule.openTime);
    const close = timeToMinutes(schedule.closeTime);
    const ends = slot + service.avgTimeMinutes;
    if (slot < open || ends > close) {
      throw new AppError("Horário fora da agenda do estabelecimento", 400);
    }
  }

  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);

  const existing = await db.appointment.findMany({
    where: {
      barbershopId: data.barbershopId,
      status: "CONFIRMED",
      date: { gte: day, lt: next },
    },
    select: {
      time: true,
      staffId: true,
      service: { select: { avgTimeMinutes: true } },
    },
  });

  const requestStart = timeToMinutes(data.time);
  const requestDuration = service.avgTimeMinutes;

  const overlapping = existing.filter((a: { time: string; staffId: string | null; service: { avgTimeMinutes: number } | null }) =>
    overlaps(
      requestStart,
      requestDuration,
      timeToMinutes(a.time),
      a.service?.avgTimeMinutes ?? 30
    )
  );

  if (data.staffId) {
    const blocksStaff = overlapping.some(
      (a: { staffId: string | null }) => !a.staffId || a.staffId === data.staffId
    );
    if (blocksStaff) {
      console.warn(
        JSON.stringify({
          event: "appointment_conflict",
          barbershopId: data.barbershopId,
          staffId: data.staffId,
          date: data.date,
          time: data.time,
        })
      );
      throw new AppError("Horário indisponível para este profissional", 409);
    }
  } else {
    const eligible = await countEligibleStaff(data.barbershopId, db);
    const busyStaff = new Set<string>();
    let nullStaffBookings = 0;
    for (const a of overlapping) {
      if (a.staffId) busyStaff.add(a.staffId);
      else nullStaffBookings += 1;
    }
    const busyCount = Math.min(eligible, busyStaff.size + nullStaffBookings);
    if (busyCount >= eligible) {
      console.warn(
        JSON.stringify({
          event: "appointment_conflict",
          barbershopId: data.barbershopId,
          mode: "any_staff",
          date: data.date,
          time: data.time,
          eligible,
          busyCount,
        })
      );
      throw new AppError(
        "Horário indisponível (todos os profissionais ocupados)",
        409
      );
    }
  }

  return { durationMinutes: service.avgTimeMinutes };
}
