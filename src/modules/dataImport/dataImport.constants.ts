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
import { isModuleEnabled } from "@/shared/segments/segmentGate";
import type { BusinessSegment } from "@prisma/client";

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


const STAFF_SCHEDULE_FIELDS: ImportFieldDefinition[] = [
  {
    key: "staffName",
    label: "Profissional",
    required: true,
    type: "text",
    synonyms: ["profissional", "professional", "equipe", "staff", "barbeiro", "cabeleireiro", "funcionario", "funcionário", "nome do profissional", "atendente", "especialista"],
    hint: "Nome do profissional da equipe. Precisa já existir no painel.",
  },
  {
    key: "dayOfWeek",
    label: "Dia da semana",
    required: true,
    type: "weekday",
    synonyms: ["dia", "dia da semana", "day", "weekday", "dia semana", "dia-semana", "semana"],
    hint: "Aceita o nome (segunda, seg) ou o número (1 = segunda, 0 e 7 = domingo).",
  },
  {
    key: "startTime",
    label: "Início",
    required: true,
    type: "time",
    synonyms: ["inicio", "início", "start", "start time", "hora inicio", "hora de inicio", "abre", "abertura", "entrada"],
    hint: "Horário de início. Use hh:mm.",
  },
  {
    key: "endTime",
    label: "Fim",
    required: true,
    type: "time",
    synonyms: ["fim", "end", "end time", "hora fim", "hora de fim", "fecha", "fechamento", "saida", "saída", "termina"],
    hint: "Horário de término. Use hh:mm.",
  },
  {
    key: "pauseStart",
    label: "Pausa (início)",
    required: false,
    type: "time",
    synonyms: ["pausa", "pausa inicio", "pausa início", "intervalo inicio", "almoco inicio", "almoço início", "break start", "intervalo de inicio"],
    hint: "Opa — o sistema guarda um intervalo por dia. Se houver pausa, o horário importado fica mais amplo e a prévia avisa.",
  },
  {
    key: "pauseEnd",
    label: "Pausa (fim)",
    required: false,
    type: "time",
    synonyms: ["pausa fim", "intervalo fim", "almoco fim", "almoço fim", "break end", "intervalo de fim"],
  },
];

const SHOP_SCHEDULE_FIELDS: ImportFieldDefinition[] = [
  {
    key: "dayOfWeek",
    label: "Dia da semana",
    required: true,
    type: "weekday",
    synonyms: ["dia", "dia da semana", "day", "weekday", "dia semana", "semana"],
    hint: "Aceita o nome (segunda, seg) ou o número (1 = segunda, 0 e 7 = domingo).",
  },
  {
    key: "startTime",
    label: "Abre às",
    required: true,
    type: "time",
    synonyms: ["abre", "abertura", "inicio", "início", "start", "open", "open time", "hora de abertura"],
    hint: "Horário de abertura. Use hh:mm.",
  },
  {
    key: "endTime",
    label: "Fecha às",
    required: true,
    type: "time",
    synonyms: ["fecha", "fechamento", "fim", "end", "close", "close time", "hora de fechamento"],
    hint: "Horário de fechamento. Use hh:mm.",
  },
  {
    key: "isOpen",
    label: "Aberto",
    required: false,
    type: "text",
    synonyms: ["aberto", "aberta", "open", "funciona", "abre", "is open", "ativo"],
    hint: "Aceita sim/não. Sem esta coluna, o dia é importado como aberto.",
  },
];

const TIME_OFF_FIELDS: ImportFieldDefinition[] = [
  {
    key: "staffName",
    label: "Profissional",
    required: true,
    type: "text",
    synonyms: ["profissional", "professional", "equipe", "staff", "barbeiro", "cabeleireiro", "funcionario", "funcionário", "nome do profissional"],
    hint: "Nome do profissional da equipe. Precisa já existir no painel.",
  },
  {
    key: "startDate",
    label: "Data inicial",
    required: true,
    type: "date",
    synonyms: ["data", "data inicial", "data de inicio", "data de início", "inicio", "início", "start date", "from", "de", "data da folga", "data inicial da folga"],
    hint: "Primeiro dia da folga. Use dd/mm/aaaa.",
  },
  {
    key: "endDate",
    label: "Data final",
    required: true,
    type: "date",
    synonyms: ["data final", "data fim", "fim", "end date", "to", "ate", "até", "data da folga", "termino", "término"],
    hint: "Último dia da folga. Use dd/mm/aaaa.",
  },
  {
    key: "timeOffReason",
    label: "Motivo",
    required: false,
    type: "text",
    synonyms: ["motivo", "reason", "observacao", "observação", "obs", "justificativa", "nota", "descricao", "descrição"],
  },
  {
    key: "timeOffStatus",
    label: "Situação",
    required: false,
    type: "text",
    synonyms: ["situacao", "situação", "status", "estado", "aprovada", "pendente", "approved", "pending"],
    hint: "Aceita aprovada/aprovado ou pendente. Sem esta coluna, a folga entra aprovada.",
  },
];

const PRODUCT_FIELDS: ImportFieldDefinition[] = [
  {
    key: "productName",
    label: "Nome do produto",
    required: true,
    type: "text",
    synonyms: ["produto", "product", "nome do produto", "item", "mercadoria", "produtos", "nome"],
    hint: "Nome do produto. Obrigatório.",
  },
  {
    key: "productSku",
    label: "Código (SKU)",
    required: false,
    type: "text",
    synonyms: ["sku", "codigo", "código", "codigo sku", "codigo do produto", "referencia", "referência", "ref"],
    hint: "Identifica o produto. Se repetir, o produto já existente é ignorado.",
  },
  {
    key: "productBarcode",
    label: "Código de barras",
    required: false,
    type: "text",
    synonyms: ["codigo de barras", "código de barras", "barcode", "ean", "gtin", "upc"],
  },
  {
    key: "productCategory",
    label: "Categoria",
    required: false,
    type: "text",
    synonyms: ["categoria", "category", "grupo", "group", "familia", "família", "tipo", "type", "linha"],
  },
  {
    key: "productDescription",
    label: "Descrição",
    required: false,
    type: "text",
    synonyms: ["descricao", "descrição", "description", "detalhes", "detalhe"],
  },
  {
    key: "productUnit",
    label: "Unidade",
    required: false,
    type: "text",
    synonyms: ["unidade", "unit", "medida", "tipo de unidade", "un"],
    hint: "Aceita un, ml, l, g, kg, caixa, pacote ou outro.",
  },
  {
    key: "productUnitLabel",
    label: "Rótulo da unidade",
    required: false,
    type: "text",
    synonyms: ["rotulo da unidade", "rótulo da unidade", "unidade de medida", "label da unidade", "nome da unidade"],
    hint: "Texto que aparece para o cliente (ex.: frasco, unidade).",
  },
  {
    key: "productType",
    label: "Tipo",
    required: false,
    type: "text",
    synonyms: ["tipo", "type", "tipo de produto", "venda", "consumo", "uso interno", "retail", "consumable"],
    hint: "Aceita venda, consumo ou ambos.",
  },
  {
    key: "salePrice",
    label: "Preço de venda",
    required: false,
    type: "money",
    synonyms: ["preco", "preço", "price", "preco de venda", "preço de venda", "valor", "valor de venda", "sale price", "preco unitario", "preço unitário"],
  },
  {
    key: "costPrice",
    label: "Custo",
    required: false,
    type: "money",
    synonyms: ["custo", "cost", "custo unitario", "custo unitário", "preco de custo", "preço de custo", "valor de custo", "custo medio", "custo médio"],
    hint: "Custo unitário. Entra no cálculo do custo médio do estoque.",
  },
  {
    key: "stockQty",
    label: "Saldo inicial",
    required: false,
    type: "quantity",
    synonyms: ["saldo", "saldo inicial", "estoque", "estoque inicial", "quantidade", "quantity", "qtd", "qtde", "stock", "saldo em estoque"],
    hint: "Saldo inicial. Vira um movimento de estoque na entrada — não é compra e não gera despesa.",
  },
  {
    key: "minStock",
    label: "Estoque mínimo",
    required: false,
    type: "quantity",
    synonyms: ["estoque minimo", "estoque mínimo", "min stock", "minimo", "mínimo", "estoque de alerta", "nivel minimo", "nível mínimo"],
  },
  {
    key: "productImage",
    label: "Imagem",
    required: false,
    type: "text",
    synonyms: ["imagem", "image", "foto", "picture", "url da imagem", "link da imagem"],
    hint: "Opa — a importação não baixa imagem. A coluna é ignorada e a prévia avisa.",
  },
];

const SERVICE_PACKAGE_FIELDS: ImportFieldDefinition[] = [
  {
    key: "packageName",
    label: "Nome do pacote",
    required: true,
    type: "text",
    synonyms: ["pacote", "package", "nome do pacote", "combo", "plano", "kit"],
    hint: "Nome do pacote no catálogo. Pacote com o mesmo nome e serviço é ignorado.",
  },
  {
    key: "serviceName",
    label: "Serviço",
    required: true,
    type: "text",
    synonyms: ["servico", "service", "serviço", "atendimento", "procedure", "servico do pacote", "serviço do pacote"],
    hint: "Serviço que o pacote entrega. Precisa já existir no catálogo.",
  },
  {
    key: "sessionCount",
    label: "Sessões",
    required: true,
    type: "number",
    synonyms: ["sessoes", "sessões", "sessions", "quantidade de sessoes", "numero de sessoes", "número de sessões", "vezes", "qtd sessoes", "sessao", "sessão"],
    hint: "Quantas sessões o pacote entrega. Use o número.",
  },
  {
    key: "packagePrice",
    label: "Preço do pacote",
    required: false,
    type: "money",
    synonyms: ["preco do pacote", "preço do pacote", "preco", "preço", "price", "valor", "valor do pacote", "package price"],
  },
  {
    key: "validityDays",
    label: "Validade (dias)",
    required: false,
    type: "number",
    synonyms: ["validade", "validade em dias", "validity", "dias de validade", "prazo de validade", "expira em", "duracao", "duração"],
    hint: "Em quantos dias o pacote vence. Sem a coluna, o pacote não expira.",
  },
];

const CLIENT_PACKAGE_FIELDS: ImportFieldDefinition[] = [
  {
    key: "clientName",
    label: "Cliente",
    required: false,
    type: "text",
    synonyms: ["cliente", "client", "nome do cliente", "customer", "paciente", "customer name", "nome"],
  },
  {
    key: "clientWhatsapp",
    label: "WhatsApp do cliente",
    required: true,
    type: "phone",
    synonyms: ["whatsapp", "telefone", "tel", "celular", "fone", "phone", "cel", "telefone do cliente", "contato"],
    hint: "Identifica o cliente. Se ainda não existir, o cliente é criado junto.",
  },
  {
    key: "packageName",
    label: "Pacote",
    required: true,
    type: "text",
    synonyms: ["pacote", "package", "nome do pacote", "combo", "plano"],
    hint: "Pacote do catálogo. Precisa já existir.",
  },
  {
    key: "totalSessions",
    label: "Sessões totais",
    required: true,
    type: "number",
    synonyms: ["sessoes totais", "sessões totais", "total de sessoes", "total sessions", "sessoes", "sessões", "quantidade", "qtd", "sessions"],
    hint: "Quantas sessões o cliente comprou.",
  },
  {
    key: "remainingSessions",
    label: "Sessões restantes",
    required: false,
    type: "number",
    synonyms: ["sessoes restantes", "sessões restantes", "saldo", "saldo de sessoes", "remaining", "remaining sessions", "disponiveis", "disponíveis", "a usar"],
    hint: "Saldo que o cliente ainda tem. Sem a coluna, vale o total de sessões.",
  },
  {
    key: "pricePaid",
    label: "Valor pago",
    required: false,
    type: "money",
    synonyms: ["valor pago", "preco pago", "preço pago", "paid", "paid amount", "valor", "total pago", "quanto pagou"],
    hint: "Valor que o cliente pagou. Entra como saldo do pacote — não gera receita nem caixa.",
  },
  {
    key: "paymentMethod",
    label: "Forma de pagamento",
    required: false,
    type: "text",
    synonyms: ["pagamento", "payment", "forma de pagamento", "payment method", "metodo", "método", "pix", "dinheiro", "cartao", "cartão"],
  },
  {
    key: "purchasedAt",
    label: "Data da compra",
    required: false,
    type: "date",
    synonyms: ["data da compra", "data", "date", "comprado em", "data de compra", "purchase date", "purchased at"],
    hint: "Data em que o cliente comprou o pacote. Use dd/mm/aaaa.",
  },
  {
    key: "expiresAt",
    label: "Vence em",
    required: false,
    type: "date",
    synonyms: ["vence em", "validade", "expira em", "data de vencimento", "expires at", "expiration"],
    hint: "Data em que o saldo vence. Use dd/mm/aaaa.",
  },
];

const FIADO_FIELDS: ImportFieldDefinition[] = [
  {
    key: "customerName",
    label: "Cliente",
    required: true,
    type: "text",
    synonyms: ["cliente", "client", "nome do cliente", "customer", "devedor", "nome"],
    hint: "Nome de quem deve. Obrigatório.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    required: true,
    type: "phone",
    synonyms: ["whatsapp", "telefone", "tel", "celular", "fone", "phone", "cel", "contato", "telefone do cliente"],
    hint: "Telefone de quem deve. Se o cliente existir com outro telefone, o fiado fica sem vínculo.",
  },
  {
    key: "fiadoDescription",
    label: "Descrição",
    required: true,
    type: "text",
    synonyms: ["descricao", "descrição", "description", "motivo", "historico", "histórico", "detalhe", "detalhes", "item", "produto", "servico", "serviço", "conteudo", "conteúdo"],
    hint: "O que ficou devendo. Obrigatório.",
  },
  {
    key: "originalAmount",
    label: "Valor",
    required: true,
    type: "money",
    synonyms: ["valor", "value", "preco", "preço", "price", "amount", "total", "valor original", "valor da divida", "valor da dívida", "divida", "dívida", "fiado"],
    hint: "Valor original da dívida. Obrigatório.",
  },
  {
    key: "paidAmount",
    label: "Valor já pago",
    required: false,
    type: "money",
    synonyms: ["valor pago", "ja pago", "já pago", "pago", "paid", "paid amount", "entregue", "parcial", "aberto", "saldo"],
    hint: "Quanto já foi pago. Não gera caixa nem lançamento financeiro.",
  },
  {
    key: "dueDate",
    label: "Vencimento",
    required: false,
    type: "date",
    synonyms: ["vencimento", "due date", "data de vencimento", "data limite", "prazo", "ate", "até"],
    hint: "Data de vencimento. Use dd/mm/aaaa.",
  },
  {
    key: "notes",
    label: "Observações",
    required: false,
    type: "text",
    synonyms: ["observacoes", "observações", "obs", "notas", "notes", "remarks", "comentarios", "comentários"],
  },
];

/** Campos aceitos por alvo. */
export const IMPORT_FIELDS_BY_TARGET: Record<ImportTargetType, ImportFieldDefinition[]> = {
  CLIENTS: CLIENT_FIELDS,
  SERVICES: SERVICE_FIELDS,
  APPOINTMENTS: APPOINTMENT_FIELDS,
  STAFF_SCHEDULES: STAFF_SCHEDULE_FIELDS,
  SHOP_SCHEDULE: SHOP_SCHEDULE_FIELDS,
  TIME_OFF: TIME_OFF_FIELDS,
  PRODUCTS: PRODUCT_FIELDS,
  SERVICE_PACKAGES: SERVICE_PACKAGE_FIELDS,
  CLIENT_PACKAGES: CLIENT_PACKAGE_FIELDS,
  FIADOS: FIADO_FIELDS,
};

/**
 * Ordem de processamento das abas.
 *
 * Uma planilha pode ter abas de tipos diferentes. A importação respeita a
 * dependência entre elas: serviço antes da agenda, pacote do catálogo antes
 * do saldo do cliente, cliente antes do fiado. A ordem em que o dono escolheu
 * as abas não importa.
 */
export const IMPORT_TARGET_ORDER: ImportTargetType[] = [
  "SERVICES",
  "CLIENTS",
  "PRODUCTS",
  "SERVICE_PACKAGES",
  "STAFF_SCHEDULES",
  "SHOP_SCHEDULE",
  "TIME_OFF",
  "CLIENT_PACKAGES",
  "FIADOS",
  "APPOINTMENTS",
];

/** Alvos disponíveis no assistente. */
export const IMPORT_TARGETS: ImportTargetType[] = [
  "CLIENTS",
  "SERVICES",
  "APPOINTMENTS",
  "STAFF_SCHEDULES",
  "SHOP_SCHEDULE",
  "TIME_OFF",
  "PRODUCTS",
  "SERVICE_PACKAGES",
  "CLIENT_PACKAGES",
  "FIADOS",
];

/**
 * Rótulo curto do alvo (usado na prévia e no histórico).
 */
export const IMPORT_TARGET_LABELS: Record<ImportTargetType, string> = {
  CLIENTS: "Clientes",
  SERVICES: "Serviços",
  APPOINTMENTS: "Agendamentos",
  STAFF_SCHEDULES: "Horários da equipe",
  SHOP_SCHEDULE: "Horário do estabelecimento",
  TIME_OFF: "Folgas e bloqueios",
  PRODUCTS: "Produtos e estoque",
  SERVICE_PACKAGES: "Pacotes (catálogo)",
  CLIENT_PACKAGES: "Pacotes dos clientes",
  FIADOS: "Fiado (dívidas)",
};

/**
 * Alvos disponíveis para o segmento do salão.
 *
 * Um escritório de advocacia não vende produto: o gate de segmento esconde o
 * alvo de produtos e estoque para ele (mesma regra que esconde a aba de
 * produtos no painel).
 */
export function availableImportTargets(
  segment?: BusinessSegment | null,
): ImportTargetType[] {
  if (isModuleEnabled(segment, "products")) return IMPORT_TARGETS;
  return IMPORT_TARGETS.filter((target) => target !== "PRODUCTS");
}

/** Opções padrão do assistente. */
export const DEFAULT_IMPORT_OPTIONS = {
  updateExisting: true,
  countFinancialValues: false,
  sendReviewInvitations: false,
  includeCase: false,
  replaceExistingSchedules: false,
  importTimeOffAsPending: false,
  updateExistingProducts: false,
  createProductCategories: true,
  sendFiadoReminders: false,
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
  STAFF_SCHEDULES: "modelo-importacao-horarios-equipe.xlsx",
  SHOP_SCHEDULE: "modelo-importacao-horario-estabelecimento.xlsx",
  TIME_OFF: "modelo-importacao-folgas.xlsx",
  PRODUCTS: "modelo-importacao-produtos.xlsx",
  SERVICE_PACKAGES: "modelo-importacao-pacotes.xlsx",
  CLIENT_PACKAGES: "modelo-importacao-pacotes-clientes.xlsx",
  FIADOS: "modelo-importacao-fiado.xlsx",
};

/**
 * Dias da semana aceitos na planilha (nome em português).
 * O número do sistema é 0 = domingo ... 6 = sábado.
 */
export const IMPORT_WEEKDAYS: Record<string, number> = {
  domingo: 0,
  dom: 0,
  "domingo-feira": 0,
  segunda: 1,
  "segunda-feira": 1,
  seg: 1,
  "seg-feira": 1,
  terca: 2,
  "terca-feira": 2,
  ter: 2,
  "ter-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  qua: 3,
  "qua-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  qui: 4,
  "qui-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sex: 5,
  "sex-feira": 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
  sáb: 6,
};
