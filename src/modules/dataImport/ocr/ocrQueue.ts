/**
 * Fila de OCR em memória (concorrência 1).
 *
 * Sem Redis em runtime de importação de imagem: a fila é simples e local ao
 * processo. Jobs excedendo o limite de espera recebem 429/503 com mensagem
 * clara, nunca "Erro interno".
 */
import { OCR_QUEUE_LIMIT, OCR_QUEUE_MAX_WAITING } from "./ocr.constants";

type OcrJob = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  buffer: Buffer;
  fileName: string;
};

let running = false;
const waiting: OcrJob[] = [];
let enqueued = 0;
let completed = 0;
let failed = 0;

class OcrQueueError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "OcrQueueError";
  }
}

/** Verifica se há vaga na fila sem enfileirar. */
export function ocrQueueCanEnqueue(): boolean {
  return waiting.length < OCR_QUEUE_MAX_WAITING && !running;
}

/** Estatísticas da fila (para logs/métricas, sem valores de célula). */
export function ocrQueueStats() {
  return {
    running,
    waiting: waiting.length,
    enqueued,
    completed,
    failed,
    limit: OCR_QUEUE_MAX_WAITING,
    concurrency: OCR_QUEUE_LIMIT,
  };
}

/** Enfileira um job de OCR. Resolve com o resultado ou rejeita com erro. */
export function enqueueOcrJob(buffer: Buffer, fileName: string): Promise<unknown> {
  if (running && waiting.length >= OCR_QUEUE_MAX_WAITING) {
    failed += 1;
    return Promise.reject(
      new OcrQueueError(
        429,
        "Fila de OCR cheia. Tente importar a imagem em alguns instantes.",
      ),
    );
  }

  enqueued += 1;
  return new Promise((resolve, reject) => {
    const job: OcrJob = { resolve, reject, buffer, fileName };
    waiting.push(job);
    processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (running) return;
  const job = waiting.shift();
  if (!job) return;
  running = true;

  try {
    const { ocrImage } = await import("./ocrWorker");
    const result = await ocrImage(job.buffer);
    completed += 1;
    job.resolve(result);
  } catch (err) {
    failed += 1;
    job.reject(
      err instanceof Error ? err : new Error(String(err)),
    );
  } finally {
    running = false;
    processQueue();
  }
}

/** Limpa a fila (uso em testes). */
export function ocrQueueResetForTests(): void {
  running = false;
  for (const job of waiting) {
    job.reject(new Error("Fila resetada"));
  }
  waiting.length = 0;
  enqueued = 0;
  completed = 0;
  failed = 0;
}
