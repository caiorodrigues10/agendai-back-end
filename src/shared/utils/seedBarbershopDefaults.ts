import type { Prisma } from "@prisma/client";
import { listNotificationPreferences } from "@/modules/notifications/services/notificationRegistry";

type SeedTx = Prisma.TransactionClient;

const DEFAULT_SCHEDULE = [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
  dayOfWeek,
  isOpen: dayOfWeek !== 0,
  openTime: "09:00",
  closeTime: "19:00",
}));

const DEFAULT_SERVICE_CATEGORIES = [
  { name: "Cortes", icon: "scissors" },
  { name: "Barba", icon: "user" },
] as const;

const DEFAULT_SERVICES = [
  { name: "Corte", price: 45, avgTimeMinutes: 30, icon: "scissors", categoryName: "Cortes" },
  { name: "Escova", price: 40, avgTimeMinutes: 40, icon: "sparkles", categoryName: "Cortes" },
  { name: "Barba", price: 30, avgTimeMinutes: 20, icon: "razor", categoryName: "Barba" },
] as const;

const DEFAULT_EXPENSE_CATEGORIES = ["Aluguel", "Salários", "Impostos e taxas", "Marketing"] as const;

const DEFAULT_PRODUCT_CATEGORIES = [
  { name: "Finalizadores", icon: "droplet", color: "#0F766E" },
  { name: "Higiene", icon: "sparkles", color: "#1D4ED8" },
] as const;

export async function seedBarbershopDefaults(
  tx: SeedTx,
  barbershopId: string,
  schedule?: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>
) {
  // Compatível com RLS em bancos criados via migrate deploy: tabelas como
  // barbershop_email_settings/loyalty_programs só liberam INSERT/UPSERT quando o
  // GUC da sessão iguala o UUID do salão (policies sem o bypass COALESCE de '').
  // set_config(..., TRUE) é local à transação e reverte sozinho no COMMIT/ROLLBACK.
  await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${barbershopId}, TRUE)`;

  const scheduleToCreate = schedule?.length === 7 ? schedule : DEFAULT_SCHEDULE;
  await tx.schedule.createMany({
    data: scheduleToCreate.map(s => ({
      barbershopId,
      dayOfWeek: s.dayOfWeek,
      isOpen: s.isOpen,
      openTime: s.openTime,
      closeTime: s.closeTime,
    })),
    skipDuplicates: true,
  });

  const categoryIds = new Map<string, string>();
  for (const category of DEFAULT_SERVICE_CATEGORIES) {
    const existing = await tx.serviceCategory.findFirst({
      where: { barbershopId, name: category.name },
    });
    if (existing) {
      categoryIds.set(category.name, existing.id);
      continue;
    }
    const created = await tx.serviceCategory.create({
      data: { barbershopId, name: category.name, icon: category.icon },
    });
    categoryIds.set(category.name, created.id);
  }

  for (const service of DEFAULT_SERVICES) {
    const categoryId = categoryIds.get(service.categoryName);
    const existing = await tx.service.findFirst({
      where: { barbershopId, name: service.name },
    });
    if (!existing) {
      await tx.service.create({
        data: {
          barbershopId,
          name: service.name,
          price: service.price,
          avgTimeMinutes: service.avgTimeMinutes,
          icon: service.icon,
          ...(categoryId ? { categoryId } : {}),
        },
      });
    } else if (!existing.categoryId && categoryId) {
      await tx.service.update({ where: { id: existing.id }, data: { categoryId } });
    }
  }

  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    const existing = await tx.expenseCategory.findFirst({ where: { barbershopId, name } });
    if (!existing) {
      await tx.expenseCategory.create({ data: { barbershopId, name } });
    }
  }

  await tx.productCategory.createMany({
    data: DEFAULT_PRODUCT_CATEGORIES.map(category => ({ barbershopId, ...category })),
    skipDuplicates: true,
  });

  await tx.appointmentPolicy.upsert({
    where: { barbershopId },
    create: { barbershopId },
    update: {},
  });

  await tx.barbershopEmailSettings.upsert({
    where: { barbershopId },
    create: { barbershopId },
    update: {},
  });

  await tx.profitSettings.upsert({
    where: { barbershopId },
    create: { barbershopId },
    update: {},
  });

  await tx.loyaltyProgram.upsert({
    where: { barbershopId },
    create: {
      barbershopId,
      type: "VISITS",
      isActive: true,
      config: {
        visitsRequired: 10,
        rewardDescription: "Cortesia",
        cashbackEnabled: false,
        cashbackPercent: 0,
      },
    },
    update: {},
  });

  await tx.notificationPreference.createMany({
    data: listNotificationPreferences().map(preference => ({
      barbershopId,
      channel: preference.channel,
      type: preference.type,
      enabled: preference.defaultEnabled,
    })),
    skipDuplicates: true,
  });
}
