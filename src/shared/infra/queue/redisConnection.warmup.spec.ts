/// <reference types="vitest/globals" />
import { EventEmitter } from "node:events";

// Permite criar os clientes (mockados) dentro do vitest.
process.env.ALLOW_TEST_REDIS = "1";

vi.mock("ioredis", () => ({
  default: class extends EventEmitter {
    status = "connecting";
    connect = vi.fn(async () => this);
    quit = vi.fn(async () => "OK");
    disconnect = vi.fn();
    ping = vi.fn(async () => "PONG");
  },
}));

import { warmupApiRedis, getApiRedisConnection } from "./redisConnection";

type ApiClient = EventEmitter & { status: string; emit: (event: string, ...args: unknown[]) => boolean };

function apiClient(): ApiClient {
  return getApiRedisConnection() as unknown as ApiClient;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("warmupApiRedis — handshake da conexão `api` no boot", () => {
  beforeEach(() => {
    // O singleton do módulo sobrevive entre testes: volta ao estado de boot.
    apiClient().status = "connecting";
  });

  it("resolve true quando a conexão fica ready dentro do prazo", async () => {
    const client = apiClient();

    setTimeout(() => {
      client.status = "ready";
      client.emit("ready");
    }, 10);

    await expect(warmupApiRedis(500)).resolves.toBe(true);
    expect(client.status).toBe("ready");
  });

  it("resolve false quando o Redis não fica pronto no prazo (fail-closed mantido)", async () => {
    await expect(warmupApiRedis(30)).resolves.toBe(false);
  });

  it("resolve false quando a conexão dispara erro", async () => {
    const client = apiClient();

    setTimeout(() => {
      client.emit("error", new Error("ECONNREFUSED"));
    }, 10);

    await expect(warmupApiRedis(500)).resolves.toBe(false);
  });

  it("retorna true imediatamente se a conexão já está pronta", async () => {
    apiClient().status = "ready";

    await expect(warmupApiRedis(500)).resolves.toBe(true);
  });

  it("espera o handshake: é o estado em que o 1º comando caía e virava 423", async () => {
    const client = apiClient();

    expect(client.status).toBe("connecting");

    const pending = warmupApiRedis(500);
    await sleep(10);
    client.status = "ready";
    client.emit("ready");

    await expect(pending).resolves.toBe(true);
  });
});
