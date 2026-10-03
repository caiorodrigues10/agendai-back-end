import { createHash } from "node:crypto";
import { FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { prisma } from "@/libs/prismaClient";
import type { Prisma } from "@prisma/client";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("idempotency");

const LEASE_MS = 120_000;
const CACHE_TTL_SECONDS = 86_400;

type MemoryEntry = { fingerprint: string; data: unknown };
const memoryResults = new Map<string, MemoryEntry>();
const memoryLocks = new Set<string>();

type IdempotencyStatus = "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "UNCERTAIN";

type IdempotencyRecordRow = {
  scope: string;
  idempotencyKey: string;
  requestFingerprint: string;
  status: string;
  response: unknown;
  updatedAt: Date;
};

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

function requestFingerprint(request: FastifyRequest): string {
  return createHash("sha256")
    .update(JSON.stringify(request.body ?? null))
    .digest("hex");
}

function recordWhere(scope: string, key: string) {
  return { scope_idempotencyKey: { scope, idempotencyKey: key } } as const;
}

function payloadMismatchError(): AppError {
  return new AppError(
    "A mesma Idempotency-Key foi usada com dados diferentes.",
    409,
    undefined,
    "IDEMPOTENCY_PAYLOAD_MISMATCH",
  );
}

function inProgressError(): AppError {
  return new AppError(
    "Cobrança em processamento. Aguarde alguns segundos.",
    409,
    undefined,
    "IDEMPOTENCY_IN_PROGRESS",
  );
}

function uncertainResultError(): AppError {
  return new AppError(
    "O resultado da operação anterior é incerto. Não repita a operação antes da conciliação.",
    409,
    undefined,
    "IDEMPOTENCY_RESULT_UNCERTAIN",
  );
}

type Claim<T> = { kind: "replay"; data: T } | { kind: "claimed" };

async function readCached<T>(cacheKey: string, fingerprint: string): Promise<T | null> {
  try {
    const cached = await getRedisConnection().get(cacheKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { fingerprint?: string; data?: T };
    if (parsed.fingerprint !== fingerprint) throw payloadMismatchError();
    return parsed.data ?? null;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn({ err: error }, "idempotency cache read failed, using database");
    return null;
  }
}

async function writeCached(cacheKey: string, fingerprint: string, data: unknown): Promise<void> {
  try {
    await getRedisConnection().set(
      cacheKey,
      JSON.stringify({ fingerprint, data }),
      "EX",
      CACHE_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn({ err: error }, "idempotency cache write failed");
  }
}

async function claimRecord<T>(
  scope: string,
  key: string,
  fingerprint: string,
): Promise<Claim<T>> {
  const where = recordWhere(scope, key);

  let record = (await prisma.idempotencyRecord.findUnique({ where })) as
    | IdempotencyRecordRow
    | null;

  if (!record) {
    try {
      // Drift do schema (B18): `response` é `Json?` e o tipo não aceita `null`
      // literal; o cast estreito preserva o valor de runtime (null de verdade)
      // em todas as gravações deste arquivo.
      await prisma.idempotencyRecord.create({
        data: {
          scope,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
          status: "IN_PROGRESS",
          response: null as unknown as Prisma.InputJsonValue,
        },
      });
      return { kind: "claimed" };
    } catch (error: unknown) {
      if (
        !(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002")
      ) {
        throw error;
      }
      record = (await prisma.idempotencyRecord.findUniqueOrThrow({ where })) as IdempotencyRecordRow;
    }
  }

  if (record.requestFingerprint !== fingerprint) throw payloadMismatchError();

  if (record.status === "SUCCEEDED" && record.response !== null) {
    return { kind: "replay", data: record.response as T };
  }

  if (record.status === "UNCERTAIN") throw uncertainResultError();

  if (record.status === "IN_PROGRESS") {
    const staleAt = record.updatedAt.getTime() + LEASE_MS;
    if (Date.now() < staleAt) throw inProgressError();
    const taken = await prisma.idempotencyRecord.updateMany({
      where: { ...where, status: "IN_PROGRESS", updatedAt: record.updatedAt },
      data: { response: null as unknown as Prisma.InputJsonValue },
    });
    if (taken.count !== 1) throw inProgressError();
    logger.warn({ scope, idempotencyKey: key }, "taking over stale idempotency lease");
    return { kind: "claimed" };
  }

  await prisma.idempotencyRecord.update({
    where,
    data: { status: "IN_PROGRESS", response: null as unknown as Prisma.InputJsonValue },
  });
  return { kind: "claimed" };
}

async function resolveFailure(
  scope: string,
  key: string,
  error: unknown,
): Promise<void> {
  const uncertain = !(error instanceof AppError);
  const status: IdempotencyStatus = uncertain ? "UNCERTAIN" : "FAILED";
  try {
    await prisma.idempotencyRecord.update({
      where: recordWhere(scope, key),
      data: { status, response: null as unknown as Prisma.InputJsonValue },
    });
  } catch (persistError) {
    logger.error(
      { err: persistError, scope, idempotencyKey: key, status },
      "could not persist idempotency failure state",
    );
  }
  if (uncertain) {
    logger.error(
      { scope, idempotencyKey: key, err: error },
      "idempotent operation failed with unknown outcome, marked as UNCERTAIN",
    );
  }
}

async function persistSuccess<T>(
  scope: string,
  key: string,
  data: T,
): Promise<void> {
  try {
    await prisma.idempotencyRecord.update({
      where: recordWhere(scope, key),
      data: { status: "SUCCEEDED", response: data as object },
    });
  } catch (error) {
    logger.error(
      { err: error, scope, idempotencyKey: key },
      "idempotency outcome could not be persisted; operator reconciliation required",
    );
  }
}

export async function executeIdempotent<T>(
  request: FastifyRequest,
  scope: string,
  operation: () => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  requireIdempotencyKey(request);
  const key = storageKey(scope, request);
  const fingerprint = requestFingerprint(request);
  const cacheKey = `${key}:result`;

  if (process.env.VITEST && !process.env.IDEMPOTENCY_REAL_PATH) {
    if (memoryResults.has(key)) {
      const cached = memoryResults.get(key)!;
      if (cached.fingerprint !== fingerprint) throw payloadMismatchError();
      return { data: cached.data as T, replayed: true };
    }
    if (memoryLocks.has(key)) throw inProgressError();
    memoryLocks.add(key);
    try {
      const data = await operation();
      memoryResults.set(key, { fingerprint, data });
      return { data, replayed: false };
    } finally {
      memoryLocks.delete(key);
    }
  }

  const cached = await readCached<T>(cacheKey, fingerprint);
  if (cached !== null) return { data: cached, replayed: true };

  const claim = await claimRecord<T>(scope, key, fingerprint);
  if (claim.kind === "replay") {
    await writeCached(cacheKey, fingerprint, claim.data);
    return { data: claim.data, replayed: true };
  }

  let data: T;
  try {
    data = await operation();
  } catch (error) {
    await resolveFailure(scope, key, error);
    throw error;
  }

  await persistSuccess(scope, key, data);
  await writeCached(cacheKey, fingerprint, data);

  return { data, replayed: false };
}

export function resetIdempotencyMemoryForTests(): void {
  memoryResults.clear();
  memoryLocks.clear();
}
