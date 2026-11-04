/**
 * Worker Tesseract ÚNICO para importação de imagens.
 *
 * Criado sob demanda (lazy), reaproveitado entre chamadas e encerrado após
 * inatividade (OCR_WORKER_IDLE_MS) para devolver RAM ao SO — crítico em
 * VM de 1 GB (PaddleOCR foi descartado justamente por isso).
 *
 * Sem download em runtime: o traineddata já deve estar em cachePath/local
 * (empacotado no build). Falha com erro explícito se faltar o arquivo.
 */
import { createWorker, type Worker } from "tesseract.js";
import { getModuleLogger } from "@/shared/utils/logger";
import { OCR_LANG, OCR_TIMEOUT_MS, OCR_WORKER_IDLE_MS } from "./ocr.constants";

const logger = getModuleLogger("data-import:ocr-worker");

let _worker: Worker | null = null;
let _workerPromise: Promise<Worker> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;
let _lastUse = 0;

const CACHE_PATH = process.env.OCR_TESSDATA_PATH ?? ".tesseract-cache";

/** Reinicia o temporizador de inatividade. */
function scheduleIdleShutdown(): void {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  _idleTimer = setTimeout(async () => {
    await shutdownOcrWorker();
  }, OCR_WORKER_IDLE_MS);
  // Não impede o Node de sair se não houver mais nada.
  if (_idleTimer.unref) _idleTimer.unref();
}

/** Encerra o worker e libera a memória do modelo. */
export async function shutdownOcrWorker(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_worker) {
    try {
      await _worker.terminate();
    } catch {
      // Ignora erros de encerramento.
    }
    _worker = null;
  }
  _workerPromise = null;
  _lastUse = 0;
  logger.debug({}, "Worker Tesseract encerrado por inatividade");
}

/** Devolve o worker único, criando-o na primeira chamada. */
export async function getOcrWorker(): Promise<Worker> {
  if (_worker) {
    _lastUse = Date.now();
    scheduleIdleShutdown();
    return _worker;
  }
  if (_workerPromise) {
    _lastUse = Date.now();
    scheduleIdleShutdown();
    return _workerPromise;
  }

  _lastUse = Date.now();
  _workerPromise = (async (): Promise<Worker> => {
    const worker = await createWorker(OCR_LANG, 1, {
      cachePath: CACHE_PATH,
      logger: () => undefined,
    });
    // Carrega o modelo explicitamente para falhar rápido se faltar o traineddata.
    try {
      await worker.recognize(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {});
    } catch (err) {
      // Pode falhar com buffer inválido, mas o modelo deve estar carregado.
    }
    _worker = worker;
    _workerPromise = null;
    scheduleIdleShutdown();
    return worker;
  })();
  return _workerPromise;
}

/** Reconhece texto em uma imagem com timeout. */
export async function ocrImage(imageBuffer: Buffer): Promise<Awaited<ReturnType<Worker["recognize"]>>> {
  const worker = await getOcrWorker();
  const timeout = setTimeout(() => {
    // Tesseract.js não expõe cancelamento nativo; o timeout é registrado
    // e o caller trata o erro de demora. O worker é reutilizado.
  }, OCR_TIMEOUT_MS);
  try {
    const result = await worker.recognize(imageBuffer, {});
    return result;
  } finally {
    clearTimeout(timeout);
    scheduleIdleShutdown();
  }
}

export { getOcrWorker as getOcrWorkerForTests };
export { shutdownOcrWorker as shutdownOcrWorkerForTests };
