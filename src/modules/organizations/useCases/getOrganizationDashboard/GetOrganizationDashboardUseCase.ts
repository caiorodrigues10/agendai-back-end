import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import { OrganizationRepository } from "../../organizationRepository";
import { resolveOrgAccessToBarbershop } from "@/shared/utils/organizationAccess";
import { withShopContext } from "@/shared/utils/withShopContext";
import { getShopOpenState, utcDateFromYmd } from "@/modules/barbershops/utils/getShopOpenState";
import {
  ymdInTimeZone,
  weekdayInTimeZone,
  minutesInTimeZone,
  timeToMinutes,
  addDaysYmd,
} from "@/modules/barbershops/utils/shopOpenState";

export interface OrgDashboardShopDTO {
  barbershopId: string;
  name: string;
  logoUrl: string | null;
  isOpen: boolean;
  accessLevel: "FULL" | "OPERATIONAL";
  liveNow: number;
  /** Ausente quando accessLevel = OPERATIONAL (faturamento é dado sensível). */
  revenue?: { today: number; week: number; month: number };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class GetOrganizationDashboardUseCase {
  private repo = new OrganizationRepository();

  /**
   * Dashboard agregado multiunidades: para cada salão ativo da organização,
   * devolve estado ao vivo (fila + agenda de hoje no fuso do salão, isOpen) e,
   * para quem tem acesso FULL, o faturamento (QueueItem.finalPrice, COMPLETED,
   * por completedAt) de hoje / semana corrente / mês corrente no fuso do salão.
   *
   * - Organização inexistente → 404 (mesmo padrão de OrganizationUseCases.getById).
   * - Requisitante sem nenhuma relação com a org → 403 (idem getById).
   * - Salão com access NONE é omitido da lista (não derruba a org inteira).
   */
  async execute(
    organizationId: string,
    userId: string,
    role: string,
    sessionBarbershopId?: string
  ): Promise<OrgDashboardShopDTO[]> {
    const org = await this.repo.findById(organizationId);
    if (!org) throw new AppError("Organização não encontrada", 404);

    const isMember = org.ownerId === userId || org.members.some((m: any) => m.userId === userId);
    if (!isMember) throw new AppError("Sem acesso a esta organização", 403);

    const now = new Date();
    const shops = org.barbershops.filter((s: any) => s.active);

    const entries = await Promise.all(
      shops.map((shop: any) => this.buildShopEntry(shop, userId, role, now, sessionBarbershopId))
    );

    return entries
      .filter((entry): entry is OrgDashboardShopDTO => entry !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async buildShopEntry(
    shop: { id: string; name: string; logoUrl: string | null; timezone: string | null },
    userId: string,
    role: string,
    now: Date,
    sessionBarbershopId?: string
  ): Promise<OrgDashboardShopDTO | null> {
    const access = await resolveOrgAccessToBarbershop(userId, role, shop.id);
    if (access === "NONE") return null; // omitido defensivamente (remoção pontual de acesso)

    const tz = shop.timezone || "America/Sao_Paulo";
    const todayYmd = ymdInTimeZone(now, tz);
    // Semana corrente: segunda-feira → domingo, no fuso do salão.
    const weekday = weekdayInTimeZone(utcDateFromYmd(todayYmd), "UTC");
    const weekStartYmd = addDaysYmd(todayYmd, -((weekday + 6) % 7));
    const monthStartYmd = `${todayYmd.slice(0, 8)}01`;
    // Limite inferior das buscas: o início mais antigo entre semana e mês.
    // `utcDateFromYmd` é meia-noite UTC do YMD — conservador (umas horas antes da
    // meia-noite local); o bucketing por `ymdInTimeZone` depois ajusta com precisão.
    const rangeStartYmd = weekStartYmd < monthStartYmd ? weekStartYmd : monthStartYmd;
    const rangeStart = utcDateFromYmd(rangeStartYmd);
    const nowMinutes = minutesInTimeZone(now, tz);

    const data = await withShopContext(sessionBarbershopId, shop.id, async () => {
      const [activeQueue, todayAppointments, openState, completedRows] = await Promise.all([
        // Fila ativa; joinedAt limitado ao começo de hoje (p/ não arrastar fila de dias
        // anteriores) — filtragem fina por dia do salão é feita em memória abaixo.
        prisma.queueItem.findMany({
          where: {
            barbershopId: shop.id,
            status: { in: ["WAITING", "IN_CHAIR"] },
            joinedAt: { gte: utcDateFromYmd(todayYmd) },
          },
          select: { joinedAt: true },
        }),
        // Agenda de hoje (data calendário no fuso do salão); "já começou e ainda não
        // passou do fim previsto" é filtrado em memória abaixo — DECISÃO EXPLÍCITA:
        // o corte usa time + service.avgTimeMinutes (fallback 30min, mesma convenção
        // do conflito de agenda em appointmentUseCases), então um CONFIRMED/CHECKED_IN
        // esquecido há horas NÃO conta como ao vivo indefinidamente. liveNow é a
        // "verdade ao vivo" dos cards; o sinal de "atendimento que deveria ter fechado
        // e não fechou" fica na tela de fila/agenda (IN_CHAIR persistente), não aqui.
        prisma.appointment.findMany({
          where: {
            barbershopId: shop.id,
            status: { in: ["CONFIRMED", "CHECKED_IN"] },
            date: utcDateFromYmd(todayYmd),
          },
          select: { time: true, service: { select: { avgTimeMinutes: true } } },
        }),
        getShopOpenState(shop.id, { now }),
        // Mesma fonte de receita do GetBarbershopInsightsUseCase: QueueItem.finalPrice
        // com fallback pro preço do serviço, status COMPLETED, por completedAt.
        access === "FULL"
          ? prisma.queueItem.findMany({
              where: {
                barbershopId: shop.id,
                status: "COMPLETED",
                completedAt: { gte: rangeStart, lte: now },
              },
              select: {
                completedAt: true,
                finalPrice: true,
                service: { select: { price: true } },
              },
            })
          : Promise.resolve([]),
      ]);

      return { activeQueue, todayAppointments, openState, completedRows };
    });

    const liveNow =
      data.activeQueue.filter((q: { joinedAt: Date }) => ymdInTimeZone(q.joinedAt, tz) === todayYmd).length +
      data.todayAppointments.filter(
        (a: { time: string; service: { avgTimeMinutes: number } | null }) => {
          const start = timeToMinutes(a.time);
          const end = start + (a.service?.avgTimeMinutes ?? 30);
          return start <= nowMinutes && nowMinutes < end;
        }
      ).length;

    const entry: OrgDashboardShopDTO = {
      barbershopId: shop.id,
      name: shop.name,
      logoUrl: shop.logoUrl,
      isOpen: data.openState.open,
      accessLevel: access === "FULL" ? "FULL" : "OPERATIONAL",
      liveNow,
    };

    if (access === "FULL") {
      const revenue = { today: 0, week: 0, month: 0 };
      for (const row of data.completedRows) {
        const price = row.finalPrice ?? row.service?.price ?? 0;
        const ymd = ymdInTimeZone(row.completedAt, tz);
        if (ymd >= monthStartYmd) revenue.month += price;
        if (ymd >= weekStartYmd) revenue.week += price;
        if (ymd === todayYmd) revenue.today += price;
      }
      entry.revenue = {
        today: round2(revenue.today),
        week: round2(revenue.week),
        month: round2(revenue.month),
      };
    }

    return entry;
  }
}
