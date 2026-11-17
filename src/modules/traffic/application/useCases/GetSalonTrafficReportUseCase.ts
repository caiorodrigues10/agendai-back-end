import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  bucketStartForDay,
  bucketStartForHour,
  type BucketGranularity,
  type ReportBucket,
} from "../../domain/periodWindows";
import {
  buildSalonPeriodWindow,
  type SalonTrafficPeriod,
} from "../../domain/salonPeriodWindows";
import {
  SALON_TRAFFIC_SECTIONS,
  salonTargetKey,
  type SalonTrafficSection,
} from "../../domain/salonTraffic";
import { trafficBeaconEnabled } from "../../trafficConfig";
import type {
  ISalonTrafficReportRepository,
  SalonTrafficDailyRow,
  SalonTrafficHourlyRow,
  SalonTrafficSectionRow,
} from "../ports/ISalonTrafficReportRepository";

export const SALON_TRAFFIC_REPORT_REPOSITORY = "SalonTrafficReportRepository";

export interface SalonTrafficQuery {
  period: SalonTrafficPeriod;
  /** Salão do dono (rota). */
  barbershopId: string;
  /** Usuário autenticado (dono do salão ou master). */
  readerId: string;
  readerRole: string;
}

export interface SalonTrafficTotals {
  visits: number;
  visitors: number;
  visitorsBasis: "daily_distinct" | "sum_of_daily_distinct";
}

export interface SalonTrafficSeriesPoint {
  bucketStart: string;
  label: string;
  visits: number;
  visitors: number;
  partial: boolean;
}

export interface SalonTrafficSectionSummary {
  section: SalonTrafficSection;
  visits: number;
  visitors: number;
}

export interface SalonTrafficOrigin {
  host: string;
  visits: number;
}

export interface SalonTrafficPayload {
  period: {
    key: SalonTrafficPeriod;
    label: string;
    granularity: BucketGranularity;
    fromDay: string;
    toDay: string;
    prevFromDay: string | null;
    prevToDay: string | null;
    timezone: "America/Sao_Paulo";
    /** Primeiro dia civil com dados — "dados a partir de". */
    dataFrom: string | null;
  };
  generatedAt: string;
  beaconEnabled: boolean;
  totals: SalonTrafficTotals;
  prevTotals: SalonTrafficTotals | null;
  deltaPct: {
    visits: number | null;
    visitors: number | null;
  } | null;
  series: SalonTrafficSeriesPoint[];
  sections: SalonTrafficSectionSummary[];
  origins: SalonTrafficOrigin[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return round2(((current - previous) / previous) * 100);
}

/**
 * Relatório de tráfego das páginas públicas de um salão (leitura do dono).
 *
 * Escopo de leitura (nunca vaza dado de outro salão):
 *   - sempre a chave do próprio salão (`b:<uuid>`);
 *   - a chave da organização (`o:<uuid>`) — que recebe os pings de slug —
 *     entra apenas para o DONO da organização (e para o MASTER_ADMIN), como
 *     pede a opção 1 do contrato ("expor o relatório apenas ao dono da
 *     organização"). ⚠️ DECISÃO PENDENTE: se a visão agregada da
 *     organização deve aparecer para todos os donos de unidade.
 *
 * Contagem (contrato):
 *   - `totals`/`series` contam apenas pings `kind:"visit"`;
 *   - `sections` soma as visitas da seção + as abas (`kind:"tab"`);
 *   - `visitors` = hash diário distinto (por dia, somado na janela).
 */
@injectable()
export class GetSalonTrafficReportUseCase {
  constructor(
    @inject(SALON_TRAFFIC_REPORT_REPOSITORY)
    private readonly repo: ISalonTrafficReportRepository,
  ) {}

  async execute(
    query: SalonTrafficQuery,
    now: Date = new Date(),
  ): Promise<SalonTrafficPayload> {
    const scope = await this.repo.findBarbershopScope(query.barbershopId);
    if (!scope) throw new AppError("Salão não encontrado", 404);

    const targets = await this.buildTargets(scope, query);
    const window = buildSalonPeriodWindow(query.period, now);
    const { fromDay, toDay, prevFromDay, prevToDay, buckets, granularity } = window;

    const [dailyRows, hourlyRows, sectionRows, origins, dataFrom] = await Promise.all([
      this.repo.findDaily(fromDay, toDay, targets),
      granularity === "hour" ? this.repo.findHourly([fromDay], targets) : Promise.resolve([]),
      this.repo.findSections(fromDay, toDay, targets),
      this.repo.findOrigins(fromDay, toDay, targets, 10),
      this.repo.findFirstDay(targets),
    ]);

    const prevDailyRows = await this.repo.findDaily(prevFromDay, prevToDay, targets);

    const totals = this.buildTotals(dailyRows, fromDay === toDay);
    const prevTotals = this.hasTraffic(prevDailyRows)
      ? this.buildTotals(prevDailyRows, prevFromDay === prevToDay)
      : null;

    const sections = this.buildSections(sectionRows);
    const hasData =
      totals.visits > 0 ||
      totals.visitors > 0 ||
      sections.some((section) => section.visits > 0 || section.visitors > 0);

    return {
      period: {
        key: window.key,
        label: window.label,
        granularity,
        fromDay,
        toDay,
        prevFromDay,
        prevToDay,
        timezone: "America/Sao_Paulo",
        dataFrom,
      },
      generatedAt: now.toISOString(),
      beaconEnabled: trafficBeaconEnabled(),
      totals,
      prevTotals,
      deltaPct: prevTotals
        ? {
            visits: pctDelta(totals.visits, prevTotals.visits),
            visitors: pctDelta(totals.visitors, prevTotals.visitors),
          }
        : null,
      // Sem nenhum dado na janela a lista vem vazia — a UI mostra
      // "Ainda sem visitas registradas" (contrato).
      series: hasData
        ? this.buildSeries({ granularity, buckets, dailyRows, hourlyRows })
        : [],
      sections: hasData ? sections : [],
      origins: hasData
        ? origins.map((origin) => ({ host: origin.origin, visits: origin.visits }))
        : [],
    };
  }

  /**
   * Chaves de atribuição visíveis para o leitor.
   *
   * O ping de slug é atribuído à organização (opção 1 do contrato); o
   * agregado da organização só entra para o dono da organização (ou o
   * MASTER_ADMIN) — nenhuma unidade enxerga o tráfego de outra.
   */
  private async buildTargets(
    scope: { id: string; organizationId: string | null },
    query: SalonTrafficQuery,
  ): Promise<string[]> {
    const targets = [salonTargetKey("barbershop", scope.id)];
    if (!scope.organizationId) return targets;

    const isMaster = query.readerRole === "MASTER_ADMIN";
    const organizationOwnerId = await this.repo.findOrganizationOwnerId(
      scope.organizationId,
    );
    if (isMaster || (organizationOwnerId && organizationOwnerId === query.readerId)) {
      targets.push(salonTargetKey("organization", scope.organizationId));
    }
    return targets;
  }

  private buildTotals(
    rows: SalonTrafficDailyRow[],
    singleDay: boolean,
  ): SalonTrafficTotals {
    const summed = rows.reduce(
      (acc, row) => ({
        visits: acc.visits + row.visits,
        visitors: acc.visitors + row.visitors,
      }),
      { visits: 0, visitors: 0 },
    );
    return {
      visits: summed.visits,
      visitors: summed.visitors,
      visitorsBasis: singleDay ? "daily_distinct" : "sum_of_daily_distinct",
    };
  }

  private hasTraffic(rows: SalonTrafficDailyRow[]): boolean {
    return rows.some((row) => row.visits > 0 || row.visitors > 0);
  }

  private buildSections(rows: SalonTrafficSectionRow[]): SalonTrafficSectionSummary[] {
    const bySection = new Map<string, { visits: number; visitors: number }>();
    for (const row of rows) {
      const current = bySection.get(row.section) ?? { visits: 0, visitors: 0 };
      current.visits += row.visits;
      current.visitors += row.visitors;
      bySection.set(row.section, current);
    }
    return SALON_TRAFFIC_SECTIONS.map((section) => ({
      section,
      visits: bySection.get(section)?.visits ?? 0,
      visitors: bySection.get(section)?.visitors ?? 0,
    }));
  }

  private buildSeries(input: {
    granularity: BucketGranularity;
    buckets: ReportBucket[];
    dailyRows: SalonTrafficDailyRow[];
    hourlyRows: SalonTrafficHourlyRow[];
  }): SalonTrafficSeriesPoint[] {
    const { granularity, buckets } = input;
    const points: SalonTrafficSeriesPoint[] = buckets.map((bucket) => ({
      bucketStart: bucket.start,
      label: bucket.label,
      visits: 0,
      visitors: 0,
      partial: bucket.partial,
    }));
    const indexByStart = new Map(points.map((point, index) => [point.bucketStart, index]));

    if (granularity === "hour") {
      for (const row of input.hourlyRows) {
        const hourKey = `${row.day}T${String(row.hour).padStart(2, "0")}`;
        const bucketStart = bucketStartForHour(hourKey, buckets);
        const index = bucketStart === null ? undefined : indexByStart.get(bucketStart);
        if (index === undefined) continue;
        points[index].visits += row.visits;
        points[index].visitors += row.visitors;
      }
      return points;
    }

    for (const row of input.dailyRows) {
      const bucketStart = bucketStartForDay(row.day, buckets);
      const index = bucketStart === null ? undefined : indexByStart.get(bucketStart);
      if (index === undefined) continue;
      points[index].visits += row.visits;
      points[index].visitors += row.visitors;
    }
    return points;
  }
}
