import { AppError } from "@/shared/errors/AppError";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("rate-limit-redis");

const SERVICE_UNAVAILABLE_MESSAGE = "Serviço temporariamente indisponível";
const DEFAULT_TIME_WINDOW_MS = 60_000;

export type RateLimitFailureMode = "reject" | "allow";

export interface RedisRateLimitStoreOptions {
  timeWindow?: number;
  max?: number;
  prefix?: string;
  onFailure?: RateLimitFailureMode;
}

export interface RateLimitChildOptions extends RedisRateLimitStoreOptions {
  method?: string | string[];
  url?: string;
  routeInfo?: { method?: string | string[]; url?: string };
}

export interface RateLimitStoreResult {
  current: number;
  ttl: number;
}

export type RateLimitStoreCallback = (
  error: Error | null,
  result?: RateLimitStoreResult,
) => void;

type PipelineResults = [error: Error | null, result: unknown][] | null;

function slotError(results: PipelineResults, index: number): Error | null {
  const slot = results?.[index];
  if (!slot) return new Error("rate-limit: resposta vazia do Redis");
  return slot[0];
}

function slotValue(results: PipelineResults, index: number): unknown {
  if (slotError(results, index)) return undefined;
  return results?.[index]?.[1];
}

export class RedisRateLimitStore {
  private readonly prefix: string;
  private readonly timeWindow: number;
  private readonly onFailure: RateLimitFailureMode;

  constructor(options: RedisRateLimitStoreOptions = {}) {
    this.prefix = options.prefix ?? "rl:";
    this.timeWindow = options.timeWindow ?? DEFAULT_TIME_WINDOW_MS;
    this.onFailure = options.onFailure ?? "reject";
  }

  static withDefaults(defaults: {
    onFailure?: RateLimitFailureMode;
  }): new (options?: RedisRateLimitStoreOptions) => RedisRateLimitStore {
    return class extends RedisRateLimitStore {
      constructor(options: RedisRateLimitStoreOptions = {}) {
        super({
          ...options,
          onFailure: defaults.onFailure ?? options.onFailure ?? "reject",
        });
      }
    };
  }

  incr(
    key: string,
    callback: RateLimitStoreCallback,
    _max?: number,
    _ban?: number,
  ): void {
    void this.executeIncr(`${this.prefix}${key}`, callback);
  }

  private async executeIncr(
    fullKey: string,
    callback: RateLimitStoreCallback,
  ): Promise<void> {
    try {
      const redis = getRedisConnection();
      const results = await redis
        .pipeline()
        .incr(fullKey)
        .pexpire(fullKey, this.timeWindow, "NX")
        .pttl(fullKey)
        .exec();

      const incrError = slotError(results, 0);
      if (incrError) throw incrError;

      const current = slotValue(results, 0);
      if (typeof current !== "number") {
        throw new Error("rate-limit: contagem inválida retornada pelo Redis");
      }

      const pttl = slotValue(results, 2);
      const ttl =
        typeof pttl === "number" && pttl >= 0
          ? pttl
          : await this.ensureExpiry(redis, fullKey);

      callback(null, { current, ttl });
    } catch (err) {
      this.handleFailure(err, callback);
    }
  }

  read(
    key: string,
    callback: RateLimitStoreCallback,
    _timeWindow?: number,
  ): void {
    void this.executeRead(`${this.prefix}${key}`, callback);
  }

  private async executeRead(
    fullKey: string,
    callback: RateLimitStoreCallback,
  ): Promise<void> {
    try {
      const redis = getRedisConnection();
      const results = await redis.pipeline().get(fullKey).pttl(fullKey).exec();

      const raw = slotValue(results, 0);
      const current =
        typeof raw === "string" ? Number.parseInt(raw, 10) || 0 : 0;
      const pttl = slotValue(results, 1);
      const ttl =
        typeof pttl === "number" && pttl >= 0 ? pttl : this.timeWindow;

      callback(null, { current, ttl });
    } catch (err) {
      this.handleFailure(err, callback);
    }
  }

  child(routeOptions: RateLimitChildOptions): RedisRateLimitStore {
    const route = routeOptions.routeInfo ?? routeOptions;
    const method = Array.isArray(route.method)
      ? route.method.join("|")
      : route.method;
    const childPrefix =
      method && route.url
        ? `${this.prefix}${method}:${route.url}:`
        : this.prefix;

    return new RedisRateLimitStore({
      timeWindow: routeOptions.timeWindow ?? this.timeWindow,
      max: routeOptions.max,
      prefix: childPrefix,
      onFailure: routeOptions.onFailure ?? this.onFailure,
    });
  }

  decrement(key: string): void {
    this.runBestEffort("decrement", (redis) =>
      redis.decr(`${this.prefix}${key}`),
    );
  }

  reset(key: string): void {
    this.runBestEffort("reset", (redis) =>
      redis.del(`${this.prefix}${key}`),
    );
  }

  private async ensureExpiry(
    redis: ReturnType<typeof getRedisConnection>,
    fullKey: string,
  ): Promise<number> {
    await redis.pexpire(fullKey, this.timeWindow);
    return this.timeWindow;
  }

  private runBestEffort(
    operation: string,
    action: (redis: ReturnType<typeof getRedisConnection>) => Promise<unknown>,
  ): void {
    try {
      void action(getRedisConnection()).catch((err) => {
        logger.error({ err, operation }, "Redis error in rate-limit op");
      });
    } catch (err) {
      logger.error({ err, operation }, "Redis error in rate-limit op");
    }
  }

  private handleFailure(
    err: unknown,
    callback: RateLimitStoreCallback,
  ): void {
    logger.error({ err }, "Redis unavailable in rate-limit store");

    if (this.onFailure === "reject") {
      callback(
        new AppError(
          SERVICE_UNAVAILABLE_MESSAGE,
          503,
          undefined,
          "RATE_LIMIT_UNAVAILABLE",
        ),
      );
      return;
    }

    callback(null, { current: 1, ttl: this.timeWindow });
  }
}
