import type { AppTx } from "@/libs/prismaClient";
import type { BusinessSegment } from "@prisma/client";
import { listNotificationPreferences } from "@/modules/notifications/services/notificationRegistry";
import { CATALOG_TEMPLATES } from "@/modules/products/catalogTemplates";
import { getSegmentConfig } from "@/shared/segments";
import {
  isAdvertisingRestricted,
  isPromotionalNotificationType,
} from "@/shared/segments/advertising";

type SeedTx = AppTx;

/** Fallback quando o segmento não vem informado — o default do banco é
 *  BARBERSHOP, então é o que um create antigo produziria. */
const FALLBACK_SEGMENT: BusinessSegment = "BARBERSHOP";

const DEFAULT_EXPENSE_CATEGORIES = ["Aluguel", "Salários", "Impostos e taxas", "Marketing"] as const;

/**
 * Cria o mínimo que um salão novo precisa para funcionar: horário, categorias
 * e serviços sugeridos, categorias de despesa/produto e as configurações de
 * policy/e-mail/lucro/fidelidade/notificação.
 *
 * Idempotente e não destrutivo: nada aqui sobrescreve o que o dono já criou.
 * Categorias e serviços são checados por nome antes de criar; os `upsert` das
 * configurações usam `update: {}`, ou seja, nunca alteram registro existente.
 *
 * @param segment escolhe o catálogo e o horário sugeridos. Quando ausente,
 *                cai em BARBERSHOP, que é o default do banco.
 */
export async function seedBarbershopDefaults(
  tx: SeedTx,
  barbershopId: string,
  segment?: BusinessSegment | null,
  schedule?: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>
) {
  // Compatível com RLS em bancos criados via migrate deploy: tabelas como
  // barbershop_email_settings/loyalty_programs só liberam INSERT/UPSERT quando o
  // GUC da sessão iguala o UUID do salão (policies sem o bypass COALESCE de '').
  // set_config(..., TRUE) é local à transação e reverte sozinho no COMMIT/ROLLBACK.
  await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${barbershopId}, TRUE)`;

  const config = getSegmentConfig(segment ?? FALLBACK_SEGMENT);
  const { serviceCategories, services } = config.catalog;
  // Segmento com restrição de publicidade (ex.: advocacia): sem marketing,
  // sem fidelidade e sem notificações promocionais.
  const advertisingRestricted = isAdvertisingRestricted(config.segment);

  const scheduleToCreate = schedule?.length === 7 ? schedule : config.schedulePreset;
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
  for (const category of serviceCategories) {
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

  for (const service of services) {
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

  const expenseCategories = advertisingRestricted
    ? DEFAULT_EXPENSE_CATEGORIES.filter((name) => name !== "Marketing")
    : DEFAULT_EXPENSE_CATEGORIES;
  for (const name of expenseCategories) {
    const existing = await tx.expenseCategory.findFirst({ where: { barbershopId, name } });
    if (!existing) {
      await tx.expenseCategory.create({ data: { barbershopId, name } });
    }
  }

  // Categorias de produto também variam por segmento (um petshop não vende
  // "Finalizadores"). O template de catálogo de produtos já é indexado por
  // segmento e cai em OTHER quando não houver.
  await tx.productCategory.createMany({
    data: CATALOG_TEMPLATES[config.segment].productCategories.map(category => ({
      barbershopId,
      ...category,
    })),
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
      isActive: !advertisingRestricted,
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
      enabled:
        advertisingRestricted && isPromotionalNotificationType(preference.type)
          ? false
          : preference.defaultEnabled,
    })),
    skipDuplicates: true,
  });
}
