import type { SalonTrafficSection } from "../../domain/salonTraffic";

/** Agregado diário de um alvo de atribuição (salão ou organização). */
export interface SalonTrafficDailyRow {
  /** Civil day (YYYY-MM-DD) in America/Sao_Paulo. */
  day: string;
  visits: number;
  visitors: number;
}

/** Agregado por hora civil (0–23) de um alvo de atribuição. */
export interface SalonTrafficHourlyRow {
  day: string;
  hour: number;
  visits: number;
  visitors: number;
}

/** Agregado por seção da página pública (período inteiro). */
export interface SalonTrafficSectionRow {
  section: SalonTrafficSection;
  visits: number;
  visitors: number;
}

/** Referrer host agregado (host only — never a path or query string). */
export interface SalonTrafficOriginRow {
  origin: string;
  visits: number;
}

/** Escopo de leitura do salão (usado para montar as chaves de contagem). */
export interface SalonTrafficScope {
  id: string;
  /** Organização dona do salão (null quando o salão é avulso). */
  organizationId: string | null;
}

/**
 * Porta de leitura do relatório de tráfego do salão.
 *
 * Todas as consultas são restritas por `targets` (as chaves de atribuição
 * que o leitor pode ver) — nunca por "todos os salões", para garantir que
 * nenhum dado de outro salão entre na resposta.
 */
export interface ISalonTrafficReportRepository {
  /** Escopo do salão solicitado (id + organização). */
  findBarbershopScope(barbershopId: string): Promise<SalonTrafficScope | null>;
  /** Dono da organização (null quando a organização não existe). */
  findOrganizationOwnerId(organizationId: string): Promise<string | null>;
  /** Linhas diárias dos alvos no intervalo (inclusive). */
  findDaily(
    fromDay: string,
    toDay: string,
    targets: readonly string[],
  ): Promise<SalonTrafficDailyRow[]>;
  /** Linhas por hora dos alvos nos dias informados. */
  findHourly(
    dayKeys: readonly string[],
    targets: readonly string[],
  ): Promise<SalonTrafficHourlyRow[]>;
  /** Seções agregadas no intervalo (inclusive). */
  findSections(
    fromDay: string,
    toDay: string,
    targets: readonly string[],
  ): Promise<SalonTrafficSectionRow[]>;
  /** Top referrers (host) do intervalo. */
  findOrigins(
    fromDay: string,
    toDay: string,
    targets: readonly string[],
    limit: number,
  ): Promise<SalonTrafficOriginRow[]>;
  /** Primeiro dia civil com dados dos alvos (null quando nunca houve). */
  findFirstDay(targets: readonly string[]): Promise<string | null>;
}
