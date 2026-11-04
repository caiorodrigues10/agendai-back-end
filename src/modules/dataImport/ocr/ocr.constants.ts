/**
 * Constantes do OCR de importação de imagens (backend).
 *
 * Tudo lido do ambiente com fallback. Nada requer rede em runtime:
 * o traineddata do Tesseract já vem empacotado no pacote do spike e
 * é referenciado por caminho local (cachePath).
 */

/** Lê um inteiro positivo do ambiente, com fallback quando não vier válido. */
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** Feature flag: importação por imagem desligada por padrão. */
export const OCR_IMPORT_ENABLED = process.env.OCR_IMPORT_ENABLED === "on";

/**
 * Tamanho máximo do arquivo de imagem (`OCR_MAX_FILE_SIZE_BYTES`).
 *
 * O valor vem do ambiente: o `.env.example` documenta a variável e o código
 * precisa obedecê-la — antes o limite era fixo no código e a env era lida por
 * ninguém.
 */
export const OCR_MAX_FILE_SIZE_BYTES = readPositiveInt(
  "OCR_MAX_FILE_SIZE_BYTES",
  10 * 1024 * 1024,
);

/** Dimensão máxima em pixels antes de redimensionar (lado maior). */
export const OCR_MAX_IMAGE_PIXELS = readPositiveInt("OCR_MAX_IMAGE_PIXELS", 2000);

/** Timeout por imagem em ms. */
export const OCR_TIMEOUT_MS = readPositiveInt("OCR_TIMEOUT_MS", 30000);

/** Tipos aceitos (validados por magic bytes, não só extensão). */
export const OCR_ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"];

/** Extensões aceitas (são verificação secundária, nunca sozinhas). */
export const OCR_ACCEPTED_EXT = [".png", ".jpg", ".jpeg", ".webp"];

/** Tempo de inatividade antes de encerrar o worker Tesseract (ms). */
export const OCR_WORKER_IDLE_MS = readPositiveInt("OCR_WORKER_IDLE_MS", 60000);

/** Limite da fila de OCR (concorrência 1). */
export const OCR_QUEUE_LIMIT = 1;

/** Número máximo de jobs enfileirados esperando. Excedeu → 429/503. */
export const OCR_QUEUE_MAX_WAITING = readPositiveInt("OCR_QUEUE_MAX_WAITING", 4);

/**
 * Piso de resolução: largura da **região da tabela** (não da imagem).
 *
 * Medido no benchmark (`spikes/ocr-benchmark/REPORT.md`):
 *   • linha 80 — "Piso medido: ~693 px de largura da REGIÃO DA TABELA …
 *     e só fica perfeito a 100% (~924 px da tabela). A imagem abaixo do piso
 *     deve ser recusada com pedido de reenvio.";
 *   • linha 265 — "recusar abaixo de ~924 px dessa região para valor
 *     (~693 px só para telefone)".
 *
 * Ou seja: 693 px é o mínimo para ler telefone; 924 px é o mínimo para ler
 * valor com segurança. Os dois são configuráveis por ambiente.
 */
export const OCR_MIN_TABLE_WIDTH_PX_TELEFONE = readPositiveInt(
  "OCR_MIN_TABLE_WIDTH_PX_TELEFONE",
  693,
);
export const OCR_MIN_TABLE_WIDTH_PX_VALOR = readPositiveInt(
  "OCR_MIN_TABLE_WIDTH_PX_VALOR",
  924,
);

/** Língua do Tesseract (português/inglês empacotados localmente). */
export const OCR_LANG = "por+eng";

/**
 * Códigos de erro do OCR — estáveis, para o frontend não depender do texto
 * da mensagem (que pode mudar) e sim do motivo.
 */
export const OCR_ERROR_CODES = {
  /** Feature flag desligada. */
  desativado: "OCR_DISABLED",
  /** Fila de leitura cheia (429). */
  filaCheia: "OCR_QUEUE_FULL",
  /** Imagem acima do limite de tamanho (413). */
  imagemGrande: "OCR_IMAGE_TOO_LARGE",
  /** Formato de imagem não aceito (400). */
  formatoInvalido: "OCR_IMAGE_FORMAT_INVALID",
  /** Imagem abaixo do piso de resolução da tabela (400). */
  resolucaoBaixa: "OCR_IMAGE_LOW_RESOLUTION",
  /** traineddata do Tesseract ausente no servidor (503). */
  traineddataAusente: "OCR_TRAINEDDATA_MISSING",
  /** Nenhuma tabela reconhecida na imagem (400). */
  semTabela: "OCR_NO_TABLE",
  /** Ainda há células do OCR esperando revisão (409). */
  revisaoPendente: "OCR_REVIEW_PENDING",
} as const;

export type OcrErrorCode =
  (typeof OCR_ERROR_CODES)[keyof typeof OCR_ERROR_CODES];
