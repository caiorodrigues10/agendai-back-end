import { createHash } from "node:crypto";
import { FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";

const memoryResults = new Map<string, unknown>();
const memoryLocks = new Set<string>();

export function requireIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{16,100}$/.test(value)) {
    throw new AppError(
      "Idempotency-Key é obrigatório para criar cobranças.",
      400,
      undefined,
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  request.idempotencyKey = value;
  return value;
}

function storageKey(scope: string, request: FastifyRequest): string {
  const owner = request.user?.id ?? request.ip;
  const digest = createHash("sha256")
    .update(`${scope}:${owner}:${request.idempotencyKey}`)
    .digest("hex");
  return `agendai:idempotency:${digest}`;
}

export async function executeIdempotent<T>(
  request: FastifyRequest,
  scope: string,
  operation: () => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  requireIdempotencyKey(request);
  const key = storageKey(scope, request);

  if (process.env.VITEST) {
    if (memoryResults.has(key)) return { data: memoryResults.get(key) as T, replayed: true };
    if (memoryLocks.has(key)) throw new AppError("Cobrança em processamento.", 409, undefined, "IDEMPOTENCY_IN_PROGRESS");
    memoryLocks.add(key);
    try {
      const data = await operation();
      memoryResults.set(key, data);
      return { data, replayed: false };
    } finally {
      memoryLocks.delete(key);
    }
  }

  const redis = getRedisConnection();
  const resultKey = `${key}:result`;
  const lockKey = `${key}:lock`;
  try {
    const cached = await redis.get(resultKey);
    if (cached) return { data: JSON.parse(cached) as T, replayed: true };

    const acquired = await redis.set(lockKey, request.correlationId, "EX", 120, "NX");
    if (!acquired) {
      throw new AppError("Cobrança em processamento. Aguarde alguns segundos.", 409, undefined, "IDEMPOTENCY_IN_PROGRESS");
    }

    try {
      const data = await operation();
      await redis.set(resultKey, JSON.stringify(data), "EX", 86_400);
      return { data, replayed: false };
    } finally {
      await redis.del(lockKey).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Proteção contra cobrança duplicada indisponível.", 503, undefined, "IDEMPOTENCY_UNAVAILABLE");
  }
}

export function resetIdempotencyMemoryForTests(): void {
  memoryResults.clear();
  memoryLocks.clear();
}

