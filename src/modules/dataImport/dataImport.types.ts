/**
 * Tipos do domínio de importação de planilhas.
 *
 * O assistente de importação tem 7 etapas (arquivo → tipo → mapa → validação →
 * prévia → confirmação → conclusão). Este arquivo guarda apenas os contratos
 * compartilhados entre rotas, use cases, parsers e worker.
 */

/** O que o lote cria. */
export type ImportTargetType =
  | "CLIENTS"
  | "SERVICES"
  | "APPOINTMENTS"
  | "STAFF_SCHEDULES"
  | "SHOP_SCHEDULE"
  | "TIME_OFF"
  | "PRODUCTS"
  | "SERVICE_PACKAGES"
  | "CLIENT_PACKAGES"
  | "FIADOS";

/** Formato aceito no upload. */
export type ImportFileFormat = "XLSX" | "CSV";

/**
 * Alvo gravado no lote.
 *
 * Espelha o enum `ImportTargetType` do Prisma e inclui `MIXED`: um lote com
 * abas de tipos diferentes é gravado como "misto" — o detalhe de cada aba vive
 * no plano (JSON do mapeamento).
 */
export type ImportBatchTargetType = ImportTargetType | "MIXED";

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
export type ImportEntityType =
  | "CLIENT"
  | "SERVICE"
  | "APPOINTMENT"
  | "CASE"
  | "STAFF_SCHEDULE"
  | "SHOP_SCHEDULE"
  | "TIME_OFF"
  | "PRODUCT"
  | "PRODUCT_CATEGORY"
  | "SERVICE_PACKAGE"
  | "CLIENT_PACKAGE"
  | "FIADO";

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
  | "staffName"
  | "date"
  | "time"
  | "status"
  | "finalPrice"
  | "paymentMethod"
  | "modality"
  | "caseName"
  | "practiceArea"
  // horários (profissional e estabelecimento)
  | "dayOfWeek"
  | "startTime"
  | "endTime"
  | "pauseStart"
  | "pauseEnd"
  | "isOpen"
  // folgas e bloqueios
  | "startDate"
  | "endDate"
  | "timeOffReason"
  | "timeOffStatus"
  // produtos e estoque
  | "productName"
  | "productSku"
  | "productBarcode"
  | "productCategory"
  | "productDescription"
  | "productUnit"
  | "productUnitLabel"
  | "productType"
  | "salePrice"
  | "costPrice"
  | "stockQty"
  | "minStock"
  | "productImage"
  // catálogo de pacotes
  | "packageName"
  | "sessionCount"
  | "packagePrice"
  | "validityDays"
  // saldo de pacotes do cliente
  | "totalSessions"
  | "remainingSessions"
  | "pricePaid"
  | "purchasedAt"
  | "expiresAt"
  // fiado
  | "customerName"
  | "fiadoDescription"
  | "originalAmount"
  | "paidAmount"
  | "dueDate";

/** Definição de um campo de destino, com rótulo por segmento. */
export interface ImportFieldDefinition {
  key: ImportFieldKey;
  /** Rótulo canônico (usado quando o segmento não define um vocabulário). */
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
  type:
    | "text"
    | "phone"
    | "email"
    | "date"
    | "time"
    | "money"
    | "number"
    | "quantity"
    | "weekday";
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
  /**
   * Substitui o horário já configurado do dia. Desligado por padrão: o dia
   * que já existe é preservado e a linha aparece como "ignorada".
   */
  replaceExistingSchedules: boolean;
  /**
   * Importa a folga como pendente de aprovação. Desligado por padrão: a
   * folga entra já aprovada (quem importa é o dono do estabelecimento).
   */
  importTimeOffAsPending: boolean;
  /**
   * Atualiza preço e estoque mínimo de produto que já existe. Desligado por
   * padrão: produto repetido é ignorado.
   */
  updateExistingProducts: boolean;
  /**
   * Cria a categoria de produto que ainda não existe. Desligado por padrão:
   * o produto entra sem categoria e a prévia avisa.
   */
  createProductCategories: boolean;
  /**
   * Envia o lembrete de cobrança do fiado importado. Desligado por padrão:
   * a importação não fala com o cliente. Quando ligado, o fiado importado
   * recebe a mesma mensagem de cobrança do botão "Cobrar" do painel.
   */
  sendFiadoReminders: boolean;
}

/** Uma aba da planilha e o que ela importa. */
export interface ImportSheetPlan {
  /** Nome da aba (`null` quando o arquivo é CSV). */
  sheetName: string | null;
  /** O que esta aba importa. */
  targetType: ImportTargetType;
  /** Coluna (índice em texto) → campo de destino. */
  columns: Record<string, string>;
  /** Opções escolhidas para esta aba. */
  options: ImportOptions;
}

/**
 * Plano do lote: o que cada aba da planilha importa.
 *
 * Uma planilha pode ter abas de tipos diferentes. As abas são processadas na
 * ordem de dependência (serviços → clientes → produtos → pacotes → horários →
 * folgas → pacotes dos clientes → fiado → agenda), não na ordem em que o dono
 * escolheu.
 */
export interface ImportPlan {
  sheets: ImportSheetPlan[];
}

/** Uma aba do arquivo, como o dono a vê na etapa de escolha do tipo. */
export interface ImportSheetInfo {
  /** Nome da aba (`null` quando o arquivo é CSV). */
  sheetName: string | null;
  headers: string[];
  preview: ImportRawRow[];
  totalRows: number;
}

/** Campo de destino como o dono o vê na tela (rótulo do segmento). */
export interface ImportFieldView {
  key: ImportFieldKey;
  label: string;
  required: boolean;
  type: ImportFieldDefinition["type"];
  hint?: string;
  synonyms: string[];
}

/** Como uma aba do plano aparece para o dono (mapa + avisos). */
export interface ImportSheetPlanView {
  sheetName: string | null;
  targetType: ImportTargetType;
  fields: ImportFieldView[];
  detectedColumns: Partial<Record<ImportFieldKey, number>>;
  columns: Record<string, string>;
  options: ImportOptions;
  /** Campos obrigatórios que ainda não foram mapeados. */
  missing: string[];
  totalRows: number;
  preview: ImportRawRow[];
  /** Avisos da aba (ex.: pausa de almoço não suportada). */
  warnings: string[];
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
  /** Aba da linha (o resultado por linha é por aba). */
  sheetName?: string | null;
  status: "VALID" | "SKIPPED" | "FAILED";
  /** Motivo legível para o dono. */
  message?: string;
  /** Campo que falhou. */
  field?: ImportFieldKey;
  /** Colunas detectadas automaticamente. */
  detected?: Partial<Record<ImportFieldKey, number>>;
  /** Avisos que não impedem a importação (ex.: pausa de almoço não suportada). */
  warnings?: string[];
}

/** Resumo do dry-run exibido na etapa de prévia. */
export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  failedRows: number;
  results: RowValidationResult[];
  /** Avisos que valem para o lote inteiro. */
  warnings: string[];
}

/** Progresso do processamento na fila. */
export interface ImportProgress {
  processedRows: number;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  skippedRows: number;
}
