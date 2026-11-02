import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Item 3 da rodada de correções: a idempotência por `messageId` precisa ser
 * uma chave com TTL no Redis (a Evolution reenvia a mesma mensagem em
 * retries; sem TTL a chave cresceria para sempre).
 */

const redis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getApiRedisConnection: () => redis,
}));

import { RedisOwnerBotStore } from "./ownerBotStore";

describe("ownerBotStore — idempotência por messageId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grava a chave da mensagem com TTL e recusa a reentrega", async () => {
    redis.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    const store = new RedisOwnerBotStore(redis as never);

    const primeira = await store.markMessageSeen("msg-1");
    const segunda = await store.markMessageSeen("msg-1");

    expect(primeira).toBe(false);
    expect(segunda).toBe(true);
    expect(redis.set).toHaveBeenNthCalledWith(
      1,
      "ownerbot:msg:msg-1",
      "1",
      "EX",
      24 * 60 * 60,
      "NX"
    );
    expect(redis.set).toHaveBeenNthCalledWith(
      2,
      "ownerbot:msg:msg-1",
      "1",
      "EX",
      24 * 60 * 60,
      "NX"
    );
  });
});
