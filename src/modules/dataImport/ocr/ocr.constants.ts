/**
 * Constantes do OCR de importação de imagens (backend).
 *
 * Tudo lido do ambiente com fallback. Nada requer rede em runtime:
 * o traineddata do Tesseract já vem empacotado no pacote do spike e
 * é referenciado por caminho local (cachePath).
 */

/** Feature flag: importação por imagem desligada por padrão. */
export const OCR_IMPORT_ENABLED = process.env.OCR_IMPORT_ENABLED === "on";

/** Tamanho máximo do arquivo de imagem (10 MB, igual ao de planilha). */
export const OCR_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Dimensão máxima em pixels antes de redimensionar (lado maior). */
export const OCR_MAX_IMAGE_PIXELS = Number(process.env.OCR_MAX_IMAGE_PIXELS ?? "2000") || 2000;

/** Timeout por imagem em ms. */
export const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS ?? "30000") || 30000;

/** Tipos aceitos (validados por magic bytes, não só extensão). */
export const OCR_ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"];

/** Extensões aceitas (são verificação secundária, nunca sozinhas). */
export const OCR_ACCEPTED_EXT = [".png", ".jpg", ".jpeg", ".webp"];

/** Tempo de inatividade antes de encerrar o worker Tesseract (ms). */
export const OCR_WORKER_IDLE_MS = Number(process.env.OCR_WORKER_IDLE_MS ?? "60000") || 60000;

/** Limite da fila de OCR (concorrência 1). */
export const OCR_QUEUE_LIMIT = 1;

/** Número máximo de jobs enfileirados esperando. Excedeu → 429/503. */
export const OCR_QUEUE_MAX_WAITING = Number(process.env.OCR_QUEUE_MAX_WAITING ?? "4") || 4;

/** Piso de resolução: largura da região da tabela (REPORT.md, acima do piso). */
export const OCR_MIN_TABLE_WIDTH_PX_TELEFONE = 693;
export const OCR_MIN_TABLE_WIDTH_PX_VALOR = 924;

/** Língua do Tesseract (português/inglês empacotados localmente). */
export const OCR_LANG = "por+eng";
