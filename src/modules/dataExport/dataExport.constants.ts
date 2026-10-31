/**
 * Constantes da exportação de planilhas.
 *
 * As abas `Agendamentos`, `Clientes` e `Serviços` usam EXATAMENTE os
 * cabeçalhos aceitos pelo assistente de importação
 * (`IMPORT_FIELDS_BY_TARGET`, em `dataImport.constants.ts`) — a planilha
 * exportada pode voltar sem mapeamento manual.
 */
import type { ExportModuleKey, ExportOptions, ExportPeriodPreset } from "./dataExport.types";

/** ── Limites ──────────────────────────────────────────────────────────────── */

/** Exportações ativas (PENDING/PROCESSING) por salão. */
export const MAX_ACTIVE_EXPORTS = 1;
/** Exportações iniciadas por salão em uma hora. */
export const MAX_EXPORTS_PER_HOUR = 10;
/** Janela máxima de um período personalizado, em meses. */
export const MAX_CUSTOM_PERIOD_MONTHS = 24;
/** Teto de linhas por aba (com aviso no Resumo quando atingido). */
export const MAX_ROWS_PER_SHEET = 200_000;
/** Tamanho máximo do arquivo gerado (50 MB). */
export const MAX_EXPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
/** Arquivo apagado 24h depois da conclusão. */
export const EXPORT_FILE_RETENTION_HOURS = 24;

/** Env (só para afrouxar em local/teste). */
export function maxExportsPerHour(): number {
  const raw = Number(process.env.EXPORT_MAX_JOBS_PER_HOUR);
  return Number.isFinite(raw) && raw > 0 ? raw : MAX_EXPORTS_PER_HOUR;
}

/** ── Módulos ──────────────────────────────────────────────────────────────── */

export const EXPORT_MODULES: ExportModuleKey[] = [
  "appointments",
  "clients",
  "services",
  "team",
  "financial",
  "commissions",
  "products",
  "sales",
  "packages",
  "fiado",
  "queue",
  "waitlist",
  "reviews",
  "loyalty",
  "posts",
  "settings",
];

/** Rótulos em PT-BR (vocabulário do dono, não o técnico). */
export const MODULE_LABELS: Record<ExportModuleKey, string> = {
  appointments: "Agendamentos",
  clients: "Clientes",
  services: "Serviços",
  team: "Equipe",
  financial: "Financeiro",
  commissions: "Comissões",
  products: "Produtos e estoque",
  sales: "Vendas (PDV)",
  packages: "Pacotes",
  fiado: "Fiado",
  queue: "Fila",
  waitlist: "Lista de espera",
  reviews: "Avaliações",
  loyalty: "Fidelidade, indicações e vouchers",
  posts: "Posts e galeria",
  settings: "Configurações do negócio",
};

/** Preset "Relatório gerencial": o essencial para quem olha o número. */
export const GERENTIAL_MODULES: ExportModuleKey[] = [
  "financial",
  "commissions",
  "services",
  "team",
];

/** Opções padrão. */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  anonymize: false,
  includeCase: false,
};

/** Rótulos dos presets de período. */
export const PERIOD_LABELS: Record<ExportPeriodPreset, string> = {
  TODAY: "Hoje",
  THIS_WEEK: "Esta semana",
  THIS_MONTH: "Este mês",
  LAST_3_MONTHS: "Últimos 3 meses",
  LAST_6_MONTHS: "Últimos 6 meses",
  LAST_12_MONTHS: "Último ano",
  CUSTOM: "Personalizado",
  ALL: "Tudo (backup completo)",
};

/** ── Nome do arquivo ──────────────────────────────────────────────────────── */

/**
 * `agendai-<negocio>-<periodo>-<data>.xlsx` — o nome vem SÓ do backend,
 * com caracteres seguros; nunca o que o usuário digitou.
 */
export function exportFileName(
  shopSlug: string | null,
  preset: ExportPeriodPreset,
  generatedAt: Date,
  extension: "xlsx" | "zip",
): string {
  const slug = (shopSlug ?? "negocio")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "negocio";
  const date = generatedAt.toISOString().slice(0, 10);
  const period = preset.toLowerCase().replace(/_/g, "-");
  return `agendai-${slug}-${period}-${date}.${extension}`;
}
