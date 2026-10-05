import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { AppError } from "@/shared/errors/AppError";
import type {
  PostRenderJob,
  PostRenderReply,
  PostRenderWorkerData,
} from "./postRenderProtocol";

const MAX_WORKERS = 16;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 15_000;

type RenderTask = {
  id: number;
  svg: string;
  resolve: (png: Buffer) => void;
  reject: (err: unknown) => void;
  timeoutMs: number;
  startedAt: number;
};

type PoolSlot = {
  worker: Worker;
  task?: RenderTask;
  timer?: ReturnType<typeof setTimeout>;
};

/**
 * Bootstrap avaliado dentro da thread do worker. Registra o compilador TS
 * (tsx) somente quando o entry é código-fonte — em produção o entry é o .js
 * gerado pelo tsup e o registro seria redundante.
 */
const WORKER_BOOTSTRAP = `
  const { workerData } = require("node:worker_threads");
  const { createRequire } = require("node:module");
  const requireFromEntry = createRequire(workerData.entry);
  if (workerData.needsTsx) requireFromEntry("tsx/cjs/api").register();
  requireFromEntry(workerData.entry);
`;

const workers: PoolSlot[] = [];
const queue: RenderTask[] = [];
let nextTaskId = 1;

function intFromEnv(name: string, min: number, max: number, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Tamanho do pool: `POST_RENDER_WORKERS`, clamp 1..16, default min(4, CPUs). */
export function postRenderPoolSize(): number {
  const fallback = Math.max(1, Math.min(4, os.cpus().length));
  return intFromEnv("POST_RENDER_WORKERS", 1, MAX_WORKERS, fallback);
}

/** Timeout fim-a-fim por render: `POST_RENDER_TIMEOUT_MS`, clamp 1s..120s. */
export function postRenderTimeoutMs(): number {
  return intFromEnv(
    "POST_RENDER_TIMEOUT_MS",
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
}

/**
 * Resolve o entry do worker: primeiro o compilado ao lado deste módulo
 * (produção), depois o .ts de origem (dev/teste).
 */
function resolveWorkerEntry(): PostRenderWorkerData {
  const here = typeof __dirname !== "undefined" ? __dirname : undefined;
  const candidates = [
    here && path.join(here, "postRenderWorker.js"),
    here && path.join(here, "postRenderWorker.ts"),
    path.join(process.cwd(), "dist/shared/infra/worker/postRenderWorker.js"),
    path.join(process.cwd(), "src/shared/infra/worker/postRenderWorker.ts"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const entry = candidates.find((candidate) => fs.existsSync(candidate));
  if (!entry) {
    throw new AppError(
      "Entry do worker de render de posts não encontrado",
      503,
      undefined,
      "POST_RENDER_UNAVAILABLE"
    );
  }
  return { entry, needsTsx: entry.endsWith(".ts") };
}

function timeoutError(task: RenderTask): AppError {
  return new AppError(
    `Renderização da imagem do post excedeu ${task.timeoutMs}ms`,
    503,
    undefined,
    "POST_RENDER_TIMEOUT"
  );
}

function unavailableError(detail: string): AppError {
  return new AppError(
    `Pool de render de posts indisponível: ${detail}`,
    503,
    undefined,
    "POST_RENDER_UNAVAILABLE"
  );
}

/** Retira o slot do pool e desvincula a tarefa (worker é considerado morto). */
function removeSlot(slot: PoolSlot): void {
  const index = workers.indexOf(slot);
  if (index >= 0) workers.splice(index, 1);
  releaseSlot(slot);
}

/** Desvincula a tarefa do slot sem descartar a thread (worker segue ocioso). */
function releaseSlot(slot: PoolSlot): void {
  if (slot.timer) {
    clearTimeout(slot.timer);
    slot.timer = undefined;
  }
  slot.task = undefined;
  slot.worker.unref();
}

function createSlot(): PoolSlot {
  const worker = new Worker(WORKER_BOOTSTRAP, {
    eval: true,
    workerData: resolveWorkerEntry(),
  });
  worker.unref();

  const slot: PoolSlot = { worker };
  worker.on("message", (reply: PostRenderReply) => onReply(slot, reply));
  worker.on("error", (err) => onWorkerDown(slot, err.message));
  worker.on("exit", (code) => onWorkerDown(slot, `exit ${code}`));
  workers.push(slot);
  return slot;
}

function dispatch(slot: PoolSlot, task: RenderTask): void {
  slot.task = task;
  slot.worker.ref();
  const remaining = Math.max(1, task.startedAt + task.timeoutMs - Date.now());
  slot.timer = setTimeout(() => onTimeout(slot, task), remaining);
  slot.timer.unref?.();
  const job: PostRenderJob = { id: task.id, svg: task.svg };
  slot.worker.postMessage(job);
}

function onReply(slot: PoolSlot, reply: PostRenderReply): void {
  const task = slot.task;
  if (!task || task.id !== reply.id) return;
  releaseSlot(slot);
  if (reply.ok) {
    task.resolve(Buffer.from(reply.png));
  } else {
    task.reject(
      new AppError(
        `Falha ao renderizar a imagem do post: ${reply.message}`,
        500,
        undefined,
        "POST_RENDER_FAILED"
      )
    );
  }
  pump();
}

function onTimeout(slot: PoolSlot, task: RenderTask): void {
  if (slot.task !== task) return;
  removeSlot(slot);
  task.reject(timeoutError(task));
  // Thread presa em render: descarta e deixa o pool recriar sob demanda.
  void slot.worker.terminate().catch(() => undefined);
  pump();
}

function onWorkerDown(slot: PoolSlot, detail: string): void {
  if (!workers.includes(slot)) return;
  const task = slot.task;
  removeSlot(slot);
  if (task) task.reject(unavailableError(detail));
  pump();
}

function failQueued(err: unknown): void {
  for (const task of queue.splice(0, queue.length)) task.reject(err);
}

function acquireSlot(): PoolSlot | undefined {
  const idle = workers.find((slot) => !slot.task);
  if (idle) return idle;
  if (workers.length >= postRenderPoolSize()) return undefined;
  return createSlot();
}

function pump(): void {
  while (queue.length > 0) {
    const task = queue[0];
    if (task.startedAt + task.timeoutMs - Date.now() <= 0) {
      queue.shift();
      task.reject(timeoutError(task));
      continue;
    }
    let slot: PoolSlot | undefined;
    try {
      slot = acquireSlot();
    } catch (err) {
      failQueued(err);
      return;
    }
    if (!slot) return;
    queue.shift();
    dispatch(slot, task);
  }
}

/**
 * Envia o SVG para um worker do pool e devolve o PNG pronto.
 *
 * Decisão (B24): assinatura assíncrona para o event loop da API não disputar
 * CPU com o Resvg; erro vira `AppError` (503 no timeout/morte do worker,
 * 500 na falha do render), nunca exceção não tratada.
 */
export function renderSvgToPng(svg: string): Promise<Buffer> {
  const timeoutMs = postRenderTimeoutMs();
  return new Promise<Buffer>((resolve, reject) => {
    queue.push({
      id: nextTaskId++,
      svg,
      resolve,
      reject,
      timeoutMs,
      startedAt: Date.now(),
    });
    pump();
  });
}

/**
 * Encerra todas as threads do pool (shutdown) e recusa o que estiver na
 * fila. Chamadas seguintes recriam os workers sob demanda, então o pool
 * também serve como "reset" em testes.
 */
export async function closePostRenderPool(): Promise<void> {
  const slots = workers.splice(0, workers.length);
  const reason = unavailableError("pool encerrado");
  failQueued(reason);
  for (const slot of slots) {
    const task = slot.task;
    releaseSlot(slot);
    if (task) task.reject(reason);
  }
  await Promise.all(
    slots.map((slot) => slot.worker.terminate().then(() => undefined, () => undefined))
  );
}
