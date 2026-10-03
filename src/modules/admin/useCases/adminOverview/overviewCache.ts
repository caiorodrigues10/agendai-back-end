/**
 * Cache read-through do painel master (overview).
 *
 * - Primário: Redis (chave por período, TTL de 60s).
 * - Fallback: memória local quando o Redis está indisponível (ou em unit
 *   tests, onde `getRedisConnection()` recusa por política).
 * - Guardas: só usa Redis com `status === 'ready'` e timeout curto por
 *   comando, para nunca pendurar a request quando o Redis cair.
 */
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";

export const OVERVIEW_CACHE_TTL_MS = 60_000;
const REDIS_TIMEOUT_MS = 400;

export interface CacheRedisClient {
  status: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

type MemoryEntry = { at: number; value: string };

const memory = new Map<string, MemoryEntry>();
const knownKeys = new Set<string>();

let redisOverride: CacheRedisClient | null | undefined;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("redis timeout")), REDIS_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function resolveRedis(): CacheRedisClient | null {
  if (redisOverride !== undefined) return redisOverride;
  try {
    const client = getRedisConnection() as unknown as CacheRedisClient;
    return client.status === "ready" ? client : null;
  } catch {
    return null;
  }
}

async function redisGet(key: string): Promise<string | null | undefined> {
  const client = resolveRedis();
  if (!client) return undefined;
  try {
    return await withTimeout(client.get(key));
  } catch {
    return undefined;
  }
}

async function redisSet(key: string, value: string): Promise<void> {
  const client = resolveRedis();
  if (!client) return;
  try {
    await withTimeout(client.set(key, value, "EX", Math.ceil(OVERVIEW_CACHE_TTL_MS / 1000)));
  } catch {
    /* fallback: o valor já está na memória */
  }
}

export const overviewCache = {
  async get(key: string): Promise<string | null> {
    const fromRedis = await redisGet(key);
    if (typeof fromRedis === "string") return fromRedis;

    const entry = memory.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at >= OVERVIEW_CACHE_TTL_MS) {
      memory.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key: string, value: string): Promise<void> {
    knownKeys.add(key);
    memory.set(key, { at: Date.now(), value });
    await redisSet(key, value);
  },

  clear(): void {
    memory.clear();
    const keys = [...knownKeys];
    knownKeys.clear();
    const client = resolveRedis();
    if (client && keys.length > 0) {
      void client.del(...keys).catch(() => undefined);
    }
  },

  /** Uso em testes: injeta (ou anula, com `null`) o cliente Redis. */
  __setRedisClient(client: CacheRedisClient | null | undefined): void {
    redisOverride = client;
  },

  __reset(): void {
    memory.clear();
    knownKeys.clear();
    redisOverride = undefined;
  },
};

/**
 * Lê do cache; em miss carrega via `load` e grava (Redis + memória).
 */
export async function readThrough<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cached = await overviewCache.get(key);
  if (cached !== null) return JSON.parse(cached) as T;

  const value = await load();
  await overviewCache.set(key, JSON.stringify(value));
  return value;
}
