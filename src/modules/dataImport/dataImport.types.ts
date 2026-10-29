/**
 * Tipos do domínio de importação de planilhas.
 *
 * O assistente de importação tem 7 etapas (arquivo → tipo → mapa → validação →
 * prévia → confirmação → conclusão). Este arquivo guarda apenas os contratos
 * compartilhados entre rotas, use cases, parsers e worker.
 */

/** O que o lote cria. */
export type ImportTargetType = "CLIENTS" | "SERVICES" | "APPOINTMENTS";

/** Formato aceito no upload. */
export type ImportFileFormat = "XLSX" | "CSV";

/** Situação do lote. Espelha o enum `ImportBatchStatus` do Prisma. */
export type ImportBatchStatus =
  | "UPLOADED"
  | "MAPPING"
  | "VALIDATING"
  | "AWAITING_CONFIRMATION"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED"
  | "CANCELLED"
  | "UNDONE"
  | "EXPIRED";

/** Tipo de entidade criada pelo lote. Espelha o enum `ImportEntityType`. */
export type ImportEntityType = "CLIENT" | "SERVICE" | "APPOINTMENT" | "CASE";

/** Situação de uma linha. Espelha o enum `ImportRowStatus`. */
export type ImportRowStatus = "PENDING" | "IMPORTED" | "SKIPPED" | "FAILED";

/**
 * Campos de destino de cada alvo. O valor é a chave canônica usada nas
 * entidades do sistema (não o rótulo — o rótulo muda por segmento).
 */
export type ImportFieldKey =
  // clientes
  | "name"
  | "whatsapp"
  | "email"
  | "birthDate"
  | "notes"
  // serviços
  | "serviceName"
  | "description"
  | "price"
  | "durationMinutes"
  | "category"
  // agendamentos
  | "clientName"
  | "clientWhatsapp"
  | "serviceName"
  | "staffName"
  | "date"
  | "time"
  | "status"
  | "finalPrice"
  | "paymentMethod"
  | "modality"
  | "caseName"
  | "practiceArea";

/** Definição de um campo de destino, com rótulo por segmento. */
export interface ImportFieldDefinition {
  key: ImportFieldKey;
  /** Rótulo canônico (usado quando o segmento não define um vocabularário). */
  label: string;
  /** O campo é obrigatório para o alvo. */
  required: boolean;
  /** Sinônimos aceitos na detecção automática de colunas. */
  synonyms: string[];
  /** Ajuda exibida no assistente. */
  hint?: string;
  /** Campo só aparece para segmentos com este perfil auxiliar. */
  requiresAuxiliaryProfile?: "case";
  /** Limita o formato aceito (usado na validação da linha). */
  type: "text" | "phone" | "email" | "date" | "time" | "money" | "number";
}

/** Mapeamento coluna → campo, mais as opções escolhidas pelo dono. */
export interface ImportMapping {
  /** Índice da coluna (0-based) → campo de destino. */
  columns: Record<number, ImportFieldKey>;
  /** Opções do assistente (datas, duplicatas, financeiro...). */
  options: ImportOptions;
}

/** Opções do dono que mudam o comportamento da importação. */
export interface ImportOptions {
  /**
   * Cria os registros que ainda não existem. Desligado = só atualiza.
   * Na prática o assistente trata "criar ou atualizar" como o fluxo padrão
   * para clientes (deduplicação por telefone).
   */
  updateExisting: boolean;
  /**
   * Considera o valor financeiro no histórico do agendamento importado.
   * Desligado por padrão: o histórico financeiro é alimentado pela conclusão
   * do atendimento, não pela importação.
   */
  countFinancialValues: boolean;
  /**
   * Envia convite de avaliação ao cliente importado.
   *
   * Fase 2 — hoje o convite de avaliação NUNCA é enviado pela importação
   * (o valor padrão é `false` e o fluxo não consulta esta opção). O histórico
   * importado não fala com o cliente.
   */
  sendReviewInvitations: boolean;
  /**
   * Coluna opcional de caso/processo. Só existe para segmentos com perfil
   * auxiliar `case` e nunca compartilha o caso com o cliente.
   */
  includeCase: boolean;
}

/** Uma linha da planilha já normalizada (valores já como string/Number). */
export type ImportRawRow = Record<string, string>;

/** Arquivo já lido: cabeçalhos, linhas e abas disponíveis. */
export interface ParsedSpreadsheet {
  headers: string[];
  rows: ImportRawRow[];
  sheetNames: string[];
  selectedSheet: string | null;
}

/** Resultado da validação de uma linha (dry-run). */
export interface RowValidationResult {
  rowNumber: number;
  status: "VALID" | "SKIPPED" | "FAILED";
  /** Motivo legível para o dono. */
  message?: string;
  /** Campo que falhou. */
  field?: ImportFieldKey;
  /** Colunas detectadas automaticamente. */
  detected?: Partial<Record<ImportFieldKey, number>>;
}

/** Resumo do dry-run exibido na etapa de prévia. */
export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  failedRows: number;
  results: RowValidationResult[];
}

/** Progresso do processamento na fila. */
export interface ImportProgress {
  processedRows: number;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  skippedRows: number;
}
