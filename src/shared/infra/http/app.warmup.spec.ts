/// <reference types="vitest/globals" />
/**
 * O warm-up da conexão Redis `api` precisa rodar em TODOS os boots, não só no
 * servidor real. Os smoke tests constroem o app via `buildApp()` + `inject`;
 * sem o hook `onReady`, o 1º `checkLock` batia no handshake do Redis e, com o
 * fail-closed do lockout (B4), o login devolvia 423 em vez de 401/200.
 */
vi.mock("@/shared/infra/queue/redisConnection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/infra/queue/redisConnection")>();
  return { ...actual, warmupApiRedis: vi.fn(async () => true) };
});

import "reflect-metadata";
import "@/shared/container";
import { buildApp } from "./app";
import { warmupApiRedis } from "@/shared/infra/queue/redisConnection";

describe("buildApp — warm-up da conexão Redis `api`", () => {
  it("espera o warm-up terminar no boot (onReady) antes de servir", async () => {
    const app = await buildApp();
    await app.ready();

    expect(warmupApiRedis).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
