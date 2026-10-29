/**
 * Constantes do assistente de importação de planilhas.
 *
 * Limites, campos aceitos por alvo e sinônimos usados na detecção automática
 * de colunas. Tudo aqui é independente do segmento — o vocabulário específico
 * (rotulos de "cliente", "serviço"...) vem de `getSegmentConfig`.
 */
import type {
  ImportFieldDefinition,
  ImportFieldKey,
  ImportTargetType,
} from "./dataImport.types";

/** ── Limites ─────────────────────────────────────────────────────────────── */

/** Tamanho máximo do arquivo enviado (10 MB). */
export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Máximo de linhas de dados por arquivo. */
export const MAX_IMPORT_ROWS = 20_000;

/** Máximo de abas lidas de uma planilha. */
export const MAX_IMPORT_SHEETS = 10;

/**
 * Máximo de importações iniciadas por salão em uma hora.
 *
 * Em produção o valor é 5. O ambiente local pode subir o número
 * (`IMPORT_MAX_BATCHES_PER_HOUR`) para o e2e poder rodar várias vezes em
 * sequência sem esbarrar na cota.
 */
export const MAX_IMPORT_BATCHES_PER_HOUR = readPositiveInt(
  "IMPORT_MAX_BATCHES_PER_HOUR",
  5,
);

/** Lê um inteiro positivo do ambiente, com fallback quando não vier válido. */
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** Só uma importação ativa por salão. */
export const MAX_ACTIVE_IMPORT_BATCHES = 1;

/** Janela de desfazer, em dias. */
export const IMPORT_UNDO_WINDOW_DAYS = 30;

/** Prazo de guarda do arquivo temporário, em dias. */
export const IMPORT_FILE_RETENTION_DAYS = 7;

/** Linhas processadas por transação no worker. */
export const IMPORT_CHUNK_SIZE = 200;

/** Soma máxima de bytes descomprimidos aceita dentro do xlsx (ZIP bomb). */
export const MAX_XLSX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;

/** Máximo de entradas dentro do zip. */
export const MAX_XLSX_ENTRIES = 500;

/** Máximo de colunas lidas por linha. */
export const MAX_IMPORT_COLUMNS = 60;

/** Máximo de caracteres por célula. */
export const MAX_IMPORT_CELL_LENGTH = 500;

/** ── Arquivos ────────────────────────────────────────────────────────────── */

/** Extensões aceitas no upload. */
export const ALLOWED_IMPORT_EXTENSIONS = [".xlsx", ".csv"] as const;

/**
 * Assinaturas binárias aceitas. A extensão sozinha não vale: o conteúdo
 * precisa bater com o formato declarado.
 */
export const IMPORT_FILE_SIGNATURES: Record<string, string[]> = {
  XLSX: ["PK\u0003\u0004", "PK\u0005\u0006", "PK\u0007\u0008"],
  CSV: [],
};

/** Extensões recusadas com mensagem explícita (macros, formatos legados). */
export const REJECTED_IMPORT_EXTENSIONS: Record<string, string> = {
  ".xlsm": "Arquivos .xlsm (com macros) não são aceitos. Salve como .xlsx.",
  ".xlsb": "Arquivos .xlsb não são aceitos. Salve como .xlsx ou .csv.",
  ".xls": "Arquivos .xls (Excel 97-2003) não são aceitos. Salve como .xlsx ou .csv.",
  ".ods": "Arquivos .ods (LibreOffice) não são aceitos. Salve como .xlsx ou .csv.",
  ".zip": "Compactas (.zip) não são aceitas. Envie a planilha diretamente.",
};

/** ── Campos por alvo ─────────────────────────────────────────────────────── */

const CLIENT_FIELDS: ImportFieldDefinition[] = [
  {
    key: "name",
    label: "Nome",
    required: true,
    type: "text",
    synonyms: ["nome", "name", "cliente", "client", "nome do cliente", "nome completo", "full name", "contato"],
    hint: "Nome do cliente. Obrigatório.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    required: true,
    type: "phone",
    synonyms: ["whatsapp", "telefone", "tel", "celular", "fone", "phone", "cel", "contato", "mobile", "telefone/whatsapp"],
    hint: "Identifica o cliente: quem já existe é atualizado, não duplicado. Com DDD.",
  },
  {
    key: "birthDate",
    label: "Data de nascimento",
    required: false,
    type: "date",
    synonyms: ["nascimento", "data de nascimento", "birth", "birthdate", "data_nascimento", "dn", "aniversario"],
  },
  {
    key: "notes",
    label: "Observações",
    required: false,
    type: "text",
    synonyms: ["observacoes", "obs", "notas", "notes", "remarks", "comentarios", "observação"],
  },
];

const SERVICE_FIELDS: ImportFieldDefinition[] = [
  {
    key: "serviceName",
    label: "Nome do serviço",
    required: true,
    type: "text",
    synonyms: ["servico", "service", "nome do servico", "nome do serviço", "atendimento", "serviço", "procedure", "item"],
    hint: "Nome do serviço. Obrigatório.",
  },
  {
    key: "price",
    label: "Preço",
    required: false,
    type: "money",
    synonyms: ["preco", "price", "valor", "valor do servico", "preço", "custo", "tarifa", "amount"],
  },
  {
    key: "durationMinutes",
    label: "Duração (minutos)",
    required: false,
    type: "number",
    synonyms: ["duracao", "duration", "minutos", "duration in minutes", "tempo", "tempo de atendimento", "duracao (min)"],
  },
  {
    key: "category",
    label: "Categoria",
    required: false,
    type: "text",
    synonyms: ["categoria", "category", "grupo", "group", "tipo", "type", "familia", "família"],
  },
  {
    key: "description",
    label: "Descrição",
    required: false,
    type: "text",
    synonyms: ["descricao", "description", "detalhes", "details", "descrição"],
  },
];

const APPOINTMENT_FIELDS: ImportFieldDefinition[] = [
  {
    key: "date",
    label: "Data",
    required: true,
    type: "date",
    synonyms: ["data", "date", "dia", "day", "data do atendimento", "data do agendamento", "when"],
    hint: "Data do atendimento. Aceita dd/mm/aaaa, aaaa-mm-dd e serial do Excel.",
  },
  {
    key: "time",
    label: "Hora",
    required: true,
    type: "time",
    synonyms: ["hora", "time", "horario", "horário", "hr", "hora do atendimento"],
    hint: "Hora do atendimento. Aceita hh:mm.",
  },
  {
    key: "clientName",
    label: "Nome do cliente",
    required: false,
    type: "text",
    synonyms: ["cliente", "client", "nome do cliente", "customer", "nome_cliente", "paciente", "customer name"],
  },
  {
    key: "clientWhatsapp",
    label: "WhatsApp do cliente",
    required: false,
    type: "phone",
    synonyms: ["whatsapp", "telefone", "tel", "celular", "fone", "phone", "cel", "telefone do cliente"],
  },
  {
    key: "serviceName",
    label: "Serviço",
    required: true,
    type: "text",
    synonyms: ["servico", "service", "atendimento", "serviço", "procedure", "tipo de atendimento"],
    hint: "Serviço do agendamento. Se não existir no catálogo, a linha é rejeitada.",
  },
  {
    key: "staffName",
    label: "Profissional",
    required: false,
    type: "text",
    synonyms: ["profissional", "professional", "equipe", "staff", "barbeiro", "cabeleireiro", "advogado", "medico", "especialista", "funcionario", "funcionário"],
  },
  {
    key: "status",
    label: "Situação",
    required: false,
    type: "text",
    synonyms: ["status", "situacao", "situação", "estado", "state", "status do atendimento"],
  },
  {
    key: "finalPrice",
    label: "Valor",
    required: false,
    type: "money",
    synonyms: ["valor", "price", "preco", "preço", "total", "valor pago", "final price", "amount"],
  },
  {
    key: "paymentMethod",
    label: "Forma de pagamento",
    required: false,
    type: "text",
    synonyms: ["pagamento", "payment", "forma de pagamento", "payment method", "metodo", "método", "pix", "dinheiro", "cartao", "cartão"],
  },
  {
    key: "modality",
    label: "Modalidade",
    required: false,
    type: "text",
    synonyms: ["modalidade", "modality", "tipo de atendimento", "presencial", "online", "remoto", "formato"],
  },
  {
    key: "caseName",
    label: "Caso/processo",
    required: false,
    type: "text",
    requiresAuxiliaryProfile: "case",
    synonyms: ["caso", "processo", "case", "process", "numero do processo", "processo judicial", "acao", "ação"],
    hint: "Apelido interno do caso. Fica restrito ao painel — nunca vai para o cliente.",
  },
  {
    key: "practiceArea",
    label: "Área de atuação",
    required: false,
    type: "text",
    requiresAuxiliaryProfile: "case",
    synonyms: ["area", "area de atuacao", "área", "pratica", "prática", "practice area", "especialidade", "area do direito"],
  },
];

/** Campos aceitos por alvo. */
export const IMPORT_FIELDS_BY_TARGET: Record<ImportTargetType, ImportFieldDefinition[]> = {
  CLIENTS: CLIENT_FIELDS,
  SERVICES: SERVICE_FIELDS,
  APPOINTMENTS: APPOINTMENT_FIELDS,
};

/** Alvos disponíveis no assistente. */
export const IMPORT_TARGETS: ImportTargetType[] = ["CLIENTS", "SERVICES", "APPOINTMENTS"];

/** Opções padrão do assistente. */
export const DEFAULT_IMPORT_OPTIONS = {
  updateExisting: true,
  countFinancialValues: false,
  sendReviewInvitations: false,
  includeCase: false,
} as const;

/** ── Situações de agendamento reconhecidas na planilha ───────────────────── */

export const IMPORT_APPOINTMENT_STATUS: Record<string, string> = {
  confirmado: "CONFIRMED",
  confirmada: "CONFIRMED",
  confirmed: "CONFIRMED",
  agendado: "CONFIRMED",
  agendada: "CONFIRMED",
  scheduled: "CONFIRMED",
  ativo: "CONFIRMED",
  pendente: "CONFIRMED",
  pending: "CONFIRMED",
  cancelado: "CANCELLED",
  cancelada: "CANCELLED",
  cancelled: "CANCELLED",
  cancelado_cliente: "CANCELLED",
  concluido: "COMPLETED",
  concluida: "COMPLETED",
  completed: "COMPLETED",
  finalizado: "COMPLETED",
  atendimento: "COMPLETED",
  checked_in: "CHECKED_IN",
  checkedin: "CHECKED_IN",
  "checked in": "CHECKED_IN",
  chegou: "CHECKED_IN",
  faltou: "NO_SHOW",
  nao_compareceu: "NO_SHOW",
  "não compareceu": "NO_SHOW",
  no_show: "NO_SHOW",
  noshow: "NO_SHOW",
};

/** Formas de pagamento reconhecidas. */
export const IMPORT_PAYMENT_METHODS: Record<string, string> = {
  dinheiro: "cash",
  cash: "cash",
  pix: "pix",
  cartao: "credit_card",
  "cartão": "credit_card",
  credito: "credit_card",
  "crédito": "credit_card",
  credit_card: "credit_card",
  debito: "debit_card",
  "débito": "debit_card",
  debit_card: "debit_card",
  fiado: "fiado",
  outro: "other",
  other: "other",
};

/** Modalidades reconhecidas. */
export const IMPORT_MODALITIES: Record<string, string> = {
  presencial: "IN_PERSON",
  in_person: "IN_PERSON",
  no_local: "IN_PERSON",
  "no local": "IN_PERSON",
  video: "VIDEO",
  online: "VIDEO",
  remoto: "VIDEO",
  telefone: "PHONE",
  phone: "PHONE",
  call: "PHONE",
};

/** Campos que carregam número de telefone (mascarados em auditoria). */
export const IMPORT_PHONE_FIELDS: ImportFieldKey[] = ["whatsapp", "clientWhatsapp"];

/** Nomes de arquivo modelo por alvo. */
export const IMPORT_TEMPLATE_FILE_NAME: Record<ImportTargetType, string> = {
  CLIENTS: "modelo-importacao-clientes.xlsx",
  SERVICES: "modelo-importacao-servicos.xlsx",
  APPOINTMENTS: "modelo-importacao-agendamentos.xlsx",
};
