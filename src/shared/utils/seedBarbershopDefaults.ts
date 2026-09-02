import { Prisma } from "@/libs/prismaClient";

const DEFAULT_SCHEDULE = [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
  dayOfWeek,
  isOpen: dayOfWeek !== 0,
  openTime: "09:00",
  closeTime: "19:00",
}));

export async function seedBarbershopDefaults(
  tx: Prisma.TransactionClient,
  barbershopId: string,
  schedule?: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>
) {
  await tx.service.createMany({
    data: [
      { barbershopId, name: "Corte", price: 45, avgTimeMinutes: 30, icon: "scissors" },
      { barbershopId, name: "Escova", price: 40, avgTimeMinutes: 40, icon: "sparkles" },
      { barbershopId, name: "Barba", price: 30, avgTimeMinutes: 20, icon: "razor" },
    ],
  });

  const scheduleToCreate = schedule?.length === 7 ? schedule : DEFAULT_SCHEDULE;
  await tx.schedule.createMany({
    data: scheduleToCreate.map(s => ({
      barbershopId,
      dayOfWeek: s.dayOfWeek,
      isOpen: s.isOpen,
      openTime: s.openTime,
      closeTime: s.closeTime,
    })),
  });
}
