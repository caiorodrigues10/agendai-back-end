/**
 * Conexões Redis por finalidade (lazy).
 * - queue: BullMQ (producers/workers) — mantém maxRetriesPerRequest: null.
 * - api: operações de request — falha rápida (commandTimeout + sem offline queue).
 * - subscriber: pub/sub dedicado, sem compartilhar socket com fila.
 *
 * Em VITEST não instancia IORedis — evita ECONNREFUSED nos unit tests.
 *
 * Env: REDIS_URL (default: redis://localhost:6379)
 */
import IORedis, { RedisOptions } from "ioredis";

type RedisPurpose = "queue" | "api" | "subscriber";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const clients: Partial<Record<RedisPurpose, IORedis>> = {};

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} inválido: esperado inteiro entre ${min} e ${max}`);
  }
  return value;
}

function tlsOptions(): Pick<RedisOptions, "tls"> {
  const useTls = REDIS_URL.startsWith("rediss://") || REDIS_URL.includes("upstash.io");
  if (!useTls) return {};
  return {
    tls: {
      rejectUnauthorized: true,
      servername: new URL(REDIS_URL).hostname,
    },
  };
}

function retryStrategy(times: number): number | null {
  if (times > 10) return null;
  return Math.min(times * 200, 5000);
}

function purposeOptions(purpose: RedisPurpose): RedisOptions {
  if (purpose === "api") {
    return {
      maxRetriesPerRequest: envInt("REDIS_API_MAX_RETRIES_PER_REQUEST", 1, 0, 10),
      enableOfflineQueue: false,
      commandTimeout: envInt("REDIS_COMMAND_TIMEOUT_MS", 2_000, 100, 120_000),
    };
  }
  return { maxRetriesPerRequest: null };
}

function assertRedisAllowedInTests(): void {
  if (process.env.VITEST && process.env.ALLOW_TEST_REDIS !== "1") {
    throw new Error(
      "Redis não deve ser usado em unit tests — mocke enqueueWhatsApp/enqueueEmail"
    );
  }
}

function createClient(purpose: RedisPurpose): IORedis {
  const client = new IORedis(REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: false,
    connectTimeout: envInt("REDIS_CONNECT_TIMEOUT_MS", 10_000, 100, 120_000),
    retryStrategy,
    ...purposeOptions(purpose),
    ...tlsOptions(),
  });
  client.connect().catch((err) => {
    console.error(`[Redis:${purpose}] Falha ao conectar:`, err.message);
  });
  client.on("error", (err) => {
    console.error(`[Redis:${purpose}] Erro de conexão:`, err.message);
  });
  return client;
}

function getClient(purpose: RedisPurpose): IORedis {
  assertRedisAllowedInTests();
  const existing = clients[purpose];
  if (existing) return existing;
  const client = createClient(purpose);
  clients[purpose] = client;
  return client;
}

/** Conexão usada por BullMQ (producers/workers). Assinatura preservada. */
export function getRedisConnection(): IORedis {
  return getClient("queue");
}

/** Alias explícito da conexão de fila — mesmo singleton de getRedisConnection(). */
export function getQueueRedisConnection(): IORedis {
  return getClient("queue");
}

/** Conexão de operações da API: falha rápida em vez de pendurar o request. */
export function getApiRedisConnection(): IORedis {
  return getClient("api");
}

/** Conexão dedicada a pub/sub (realtime), isolada do tráfego de fila. */
export function getSubscriberConnection(): IORedis {
  return getClient("subscriber");
}

export async function closeRedisConnections(): Promise<void> {
  const open = (Object.values(clients) as Array<IORedis | undefined>).filter(
    (client): client is IORedis => Boolean(client)
  );
  (Object.keys(clients) as RedisPurpose[]).forEach((key) => {
    delete clients[key];
  });

  await Promise.all(
    open.map(async (client) => {
      const quitting = client.quit().catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        quitting,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 2_000);
          timer.unref?.();
        }),
      ]);
      if (timer) clearTimeout(timer);
      client.disconnect();
    })
  );
}

/**
 * Compat: lazy proxy. Prefer getRedisConnection() em código novo.
 * Acesso em VITEST lança ao usar (não no import).
 */
export const redisConnection: IORedis = new Proxy({} as IORedis, {
  get(_target, prop, receiver) {
    const conn = getRedisConnection();
    const value = Reflect.get(conn, prop, receiver);
    return typeof value === "function" ? value.bind(conn) : value;
  },
});
