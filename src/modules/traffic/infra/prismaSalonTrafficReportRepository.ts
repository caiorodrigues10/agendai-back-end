import { injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { civilDayToDate } from "../domain/periodWindows";
import type { SalonTrafficSection } from "../domain/salonTraffic";
import type {
  ISalonTrafficReportRepository,
  SalonTrafficDailyRow,
  SalonTrafficHourlyRow,
  SalonTrafficOriginRow,
  SalonTrafficScope,
  SalonTrafficSectionRow,
} from "../application/ports/ISalonTrafficReportRepository";

/**
 * Prisma adapter das leituras do relatório de tráfego do salão.
 *
 * Toda consulta é filtrada por `target IN (...)` — as chaves de atribuição
 * que o leitor pode ver. Nenhuma consulta "agrega por salão" em outra
 * dimensão: um dono nunca enxerga o tráfego de outro salão.
 *
 * As tabelas de tráfego do salão são de escopo plataforma (sem RLS, sem
 * `barbershopId`): a autorização acontece na aplicação, antes da query —
 * ver `docs/RLS-INVENTARIO.md`.
 */
@injectable()
export class PrismaSalonTrafficReportRepository implements ISalonTrafficReportRepository {
  async findBarbershopScope(barbershopId: string): Promise<SalonTrafficScope | null> {
    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { id: true, organizationId: true },
    });
    if (!shop) return null;
    return { id: shop.id, organizationId: shop.organizationId ?? null };
  }

  async findOrganizationOwnerId(organizationId: string): Promise<string | null> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    return organization?.ownerId ?? null;
  }

  async findDaily(
    fromDay: string,
    toDay: string,
    targets: readonly string[],
  ): Promise<SalonTrafficDailyRow[]> {
    if (targets.length === 0) return [];
    const rows = await prisma.salonTrafficDaily.findMany({
      where: {
        day: { gte: civilDayToDate(fromDay), lte: civilDayToDate(toDay) },
        target: { in: [...targets] },
      },
      orderBy: { day: "asc" },
    });
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      visits: row.visits,
      visitors: row.visitors,
    }));
  }

  async findHourly(
    dayKeys: readonly string[],
    targets: readonly string[],
  ): Promise<SalonTrafficHourlyRow[]> {
    if (dayKeys.length === 0 || targets.length === 0) return [];
    const rows = await prisma.salonTrafficHourly.findMany({
      where: {
        day: { in: dayKeys.map(civilDayToDate) },
        target: { in: [...targets] },
      },
      orderBy: [{ day: "asc" }, { hour: "asc" }],
    });
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      hour: row.hour,
      visits: row.visits,
      visitors: row.visitors,
    }));
  }

  async findSections(
    fromDay: string,
    toDay: string,
    targets: readonly string[],
  ): Promise<SalonTrafficSectionRow[]> {
    if (targets.length === 0) return [];
    const grouped = await prisma.salonTrafficSectionDaily.groupBy({
      by: ["section"],
      where: {
        day: { gte: civilDayToDate(fromDay), lte: civilDayToDate(toDay) },
        target: { in: [...targets] },
      },
      _sum: { visits: true, visitors: true },
    });
    return grouped.map((row) => ({
      section: row.section as SalonTrafficSection,
      visits: row._sum.visits ?? 0,
      visitors: row._sum.visitors ?? 0,
    }));
  }

  async findOrigins(
    fromDay: string,
    toDay: string,
    targets: readonly string[],
    limit: number,
  ): Promise<SalonTrafficOriginRow[]> {
    if (targets.length === 0) return [];
    const grouped = await prisma.salonTrafficOriginDaily.groupBy({
      by: ["origin"],
      where: {
        day: { gte: civilDayToDate(fromDay), lte: civilDayToDate(toDay) },
        target: { in: [...targets] },
      },
      _sum: { visits: true },
      orderBy: { _sum: { visits: "desc" } },
      take: limit,
    });
    return grouped.map((row) => ({
      origin: row.origin,
      visits: row._sum.visits ?? 0,
    }));
  }

  async findFirstDay(targets: readonly string[]): Promise<string | null> {
    if (targets.length === 0) return null;
    const row = await prisma.salonTrafficDaily.findFirst({
      where: {
        target: { in: [...targets] },
        OR: [{ visits: { gt: 0 } }, { visitors: { gt: 0 } }],
      },
      orderBy: { day: "asc" },
      select: { day: true },
    });
    return row ? row.day.toISOString().slice(0, 10) : null;
  }
}
