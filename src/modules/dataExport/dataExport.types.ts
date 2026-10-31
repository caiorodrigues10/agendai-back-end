/**
 * Tipos da exportação de planilhas.
 *
 * O vocabulário espelha o da importação (`dataImport.types.ts`): o que sai da
 * exportação em `Agendamentos`/`Clientes`/`Serviços` precisa voltar pelo
 * assistente de importação sem mapeamento manual.
 */

/** Presets de período (iguais aos relatórios do app). */
export type ExportPeriodPreset =
  | "TODAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "LAST_3_MONTHS"
  | "LAST_6_MONTHS"
  | "LAST_12_MONTHS"
  | "CUSTOM"
  | "ALL";

/** Período já resolvido no fuso do salão. */
export interface ExportPeriod {
  preset: ExportPeriodPreset;
  /** Início [start] no fuso do salão — null = "Tudo" (sem filtro). */
  from: Date | null;
  /** Fim [end] no fuso do salão — null = "Tudo" (sem filtro). */
  to: Date | null;
  /** Rótulo em PT-BR para a aba Resumo. */
  label: string;
  timezone: string;
}

/** Chaves de módulo aceitas na emissão. */
export type ExportModuleKey =
  | "appointments"
  | "clients"
  | "services"
  | "team"
  | "financial"
  | "commissions"
  | "products"
  | "sales"
  | "packages"
  | "fiado"
  | "queue"
  | "waitlist"
  | "reviews"
  | "loyalty"
  | "posts"
  | "settings";

/** Opções de emissão. */
export interface ExportOptions {
  /** Mascara nome, telefone e e-mail de clientes (relatório para contador). */
  anonymize: boolean;
  /** Inclui caso/processo e dados de casos (LAW_FIRM; sigilo profissional). */
  includeCase: boolean;
}

/** Progresso por aba durante a geração. */
export interface ExportProgress {
  currentSheet: string | null;
  sheetsDone: number;
  sheetsTotal: number;
  rowsWritten: number;
  /** Abas puladas (módulo oculto no gate ou sem dados no plano). */
  skippedSheets: string[];
}

/** Formato do arquivo. */
export type ExportFormat = "XLSX" | "CSV_ZIP" | "PDF";

/** O que o use case recebe para criar um pedido. */
export interface CreateExportInput {
  barbershopId: string;
  userId: string;
  periodPreset: ExportPeriodPreset;
  /** yyyy-mm-dd (exigido só quando preset = CUSTOM). */
  dateFrom?: string;
  /** yyyy-mm-dd (exigido só quando preset = CUSTOM). */
  dateTo?: string;
  /** Módulos incluídos; ausente ou vazio = todos os disponíveis. */
  modules?: ExportModuleKey[];
  /** Presets que sobrescrevem `modules` (gerencial / backup). */
  preset?: "GERENTIAL" | "BACKUP";
  format?: ExportFormat;
  options?: Partial<ExportOptions>;
}

/** Resumo do job para a API. */
export interface ExportJobSummary {
  id: string;
  periodPreset: string;
  periodFrom: string | null;
  periodTo: string | null;
  timezone: string;
  modules: string[];
  options: ExportOptions;
  format: ExportFormat;
  status: string;
  progress: ExportProgress | null;
  fileSizeBytes: number | null;
  fileName: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
}
