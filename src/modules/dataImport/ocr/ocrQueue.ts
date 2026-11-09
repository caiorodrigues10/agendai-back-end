/**
 * Fila de OCR em memória (concorrência 1).
 *
 * Sem Redis em runtime de importação de imagem: a fila é simples e local ao
 * processo. Jobs excedendo o limite de espera recebem 429 com mensagem
 * clara, nunca "Erro interno".
 *
 * A fila executa a **tarefa** enfileirada (a extração inteira): assim a
 * imagem é reconhecida uma única vez — enfileirar e depois extrair fora da
 * fila faria o OCR rodar duas vezes.
 */
import { OCR_QUEUE_LIMIT, OCR_QUEUE_MAX_WAITING, OCR_ERROR_CODES } from "./ocr.constants";
import { AppError } from "@/shared/errors/AppError";

/** Tarefa de OCR enfileirada. */
export type OcrJobTask<T> = () => Promise<T>;

type OcrJob<T> = {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  task: OcrJobTask<T>;
};

let running = false;
const waiting: OcrJob<unknown>[] = [];
let enqueued = 0;
let completed = 0;
let failed = 0;

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

/**
 * Enfileira um job de OCR. Resolve com o resultado ou rejeita com erro.
 *
 * Fila cheia → 429 (`OCR_QUEUE_FULL`).
 */
export function enqueueOcrJob<T>(task: OcrJobTask<T>): Promise<T> {
  if (running && waiting.length >= OCR_QUEUE_MAX_WAITING) {
    failed += 1;
    return Promise.reject(
      new AppError(
        "A fila de leitura de imagens está cheia. Tente enviar a imagem de novo em alguns instantes.",
        429,
        undefined,
        OCR_ERROR_CODES.filaCheia,
      ),
    );
  }

  enqueued += 1;
  return new Promise<T>((resolve, reject) => {
    const job: OcrJob<T> = { resolve, reject, task };
    waiting.push(job as OcrJob<unknown>);
    processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (running) return;
  const job = waiting.shift();
  if (!job) return;
  running = true;

  try {
    const result = await job.task();
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
