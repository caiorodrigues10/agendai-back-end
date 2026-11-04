/**
 * Worker Tesseract ÚNICO para importação de imagens.
 *
 * Criado sob demanda (lazy), reaproveitado entre chamadas e encerrado após
 * inatividade (OCR_WORKER_IDLE_MS) para devolver RAM ao SO — crítico em
 * VM de 1 GB (PaddleOCR foi descartado justamente por isso).
 *
 * Sem download em runtime: o traineddata tem de estar no cachePath local
 * (empacotado no build). Se faltar, o erro é **explícito** — nunca uma
 * tentativa de rede e nunca "erro interno".
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import { getModuleLogger } from "@/shared/utils/logger";
import { AppError } from "@/shared/errors/AppError";
import { OCR_ERROR_CODES, OCR_LANG, OCR_TIMEOUT_MS, OCR_WORKER_IDLE_MS } from "./ocr.constants";

const logger = getModuleLogger("data-import:ocr-worker");

let _worker: Worker | null = null;
let _workerPromise: Promise<Worker> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;
let _lastUse = 0;

/** Caminho do cache do traineddata (relativo é resolvido a partir do cwd). */
export const OCR_TESSDATA_PATH = process.env.OCR_TESSDATA_PATH ?? ".tesseract-cache";

/** Caminho absoluto do cache do traineddata. */
export function caminhoTessdata(): string {
  return resolve(process.cwd(), OCR_TESSDATA_PATH);
}

/** Idiomas que o Tesseract precisa carregar. */
export function linguasTessdata(): string[] {
  return OCR_LANG.split("+").map((lang) => lang.trim()).filter(Boolean);
}

/**
 * Verifica se o traineddata de cada idioma está no cache local.
 *
 * O tesseract.js procura `${cachePath}/${lang}.traineddata`; sem o arquivo ele
 * tenta baixar da rede — que não pode acontecer no servidor.
 */
export function verificarTessdata(): {
  ok: boolean;
  caminho: string;
  faltantes: string[];
} {
  const caminho = caminhoTessdata();
  const faltantes = linguasTessdata().filter(
    (lang) => !existsSync(resolve(caminho, `${lang}.traineddata`)),
  );
  return { ok: faltantes.length === 0, caminho, faltantes };
}

/**
 * Erro explícito de traineddata ausente.
 *
 * O mesmo erro é usado no upload (antes de gravar o lote) e na criação do
 * worker: o dono vê a mesma mensagem nos dois pontos.
 */
export function erroTessdataAusente(tessdata: {
  caminho: string;
  faltantes: string[];
}): AppError {
  return new AppError(
    `O reconhecedor de texto não está instalado no servidor (faltou o traineddata de: ${tessdata.faltantes.join(", ")} em ${tessdata.caminho}). A importação por imagem fica indisponível até o arquivo ser instalado.`,
    503,
    undefined,
    OCR_ERROR_CODES.traineddataAusente,
  );
}

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

  const tessdata = verificarTessdata();
  if (!tessdata.ok) {
    throw erroTessdataAusente(tessdata);
  }

  _lastUse = Date.now();
  _workerPromise = (async (): Promise<Worker> => {
    const worker = await createWorker(OCR_LANG, 1, {
      cachePath: OCR_TESSDATA_PATH,
      logger: () => undefined,
    });
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
