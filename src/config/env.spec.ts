/// <reference types="vitest/globals" />

import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("aplica defaults quando as variáveis estão ausentes", () => {
    const env = parseEnv({});

    expect(env.port).toBe(3333);
    expect(env.processRole).toBe("all");
    expect(env.dbPoolMax).toBe(10);
    expect(env.dbIdleTimeoutMs).toBe(30_000);
    expect(env.dbConnectionTimeoutMs).toBe(10_000);
    expect(env.redisUrl).toBeUndefined();
    expect(env.notificationV2Mode).toBe("disabled");
    expect(env.redisConnectTimeoutMs).toBe(10_000);
    expect(env.redisCommandTimeoutMs).toBe(2_000);
    expect(env.redisApiMaxRetriesPerRequest).toBe(1);
    expect(env.shutdownDrainTimeoutMs).toBe(20_000);
  });

  it("coage PORT para inteiro dentro da faixa", () => {
    expect(parseEnv({ PORT: "8080" }).port).toBe(8080);
    expect(parseEnv({ PORT: "" }).port).toBe(3333);
  });

  it.each(["0", "65536", "abc", "NaN", "3.5"])("rejeita PORT=%s", (port) => {
    expect(() => parseEnv({ PORT: port })).toThrow(/Configuração inválida/);
  });

  it("valida inteiros de pool e timeouts de banco", () => {
    expect(() => parseEnv({ DB_POOL_MAX: "0" })).toThrow(/DB_POOL_MAX/);
    expect(() => parseEnv({ DB_IDLE_TIMEOUT_MS: "abc" })).toThrow(/DB_IDLE_TIMEOUT_MS/);
    expect(() => parseEnv({ DB_CONNECTION_TIMEOUT_MS: "-1" })).toThrow(
      /DB_CONNECTION_TIMEOUT_MS/
    );
    expect(parseEnv({ DB_POOL_MAX: "25" }).dbPoolMax).toBe(25);
  });

  it.each([
    ["redis://localhost:6379"],
    ["rediss://default:secret@host:6379"],
    ["redis://user:pass@upstash.io:6379"],
  ])("aceita REDIS_URL=%s", (redisUrl) => {
    expect(parseEnv({ REDIS_URL: redisUrl }).redisUrl).toBe(redisUrl);
  });

  it.each(["http://localhost:6379", "localhost:6379", "redis-cached://x"])(
    "rejeita REDIS_URL=%s",
    (redisUrl) => {
      expect(() => parseEnv({ REDIS_URL: redisUrl })).toThrow(/REDIS_URL/);
    }
  );

  it("trata REDIS_URL vazia como ausente", () => {
    expect(parseEnv({ REDIS_URL: "" }).redisUrl).toBeUndefined();
  });

  it("não ecoa o valor de REDIS_URL na mensagem de erro", () => {
    expect(() => parseEnv({ REDIS_URL: "ftp://segredo-super-secreto" })).not.toThrow(
      /segredo-super-secreto/
    );
  });

  it("valida NOTIFICATION_V2_MODE", () => {
    expect(parseEnv({ NOTIFICATION_V2_MODE: "shadow" }).notificationV2Mode).toBe("shadow");
    expect(() => parseEnv({ NOTIFICATION_V2_MODE: "activee" })).toThrow(
      /NOTIFICATION_V2_MODE/
    );
  });

  it("valida os timeouts de Redis sem aceitar NaN", () => {
    expect(parseEnv({ REDIS_COMMAND_TIMEOUT_MS: "1500" }).redisCommandTimeoutMs).toBe(1500);
    expect(() => parseEnv({ REDIS_COMMAND_TIMEOUT_MS: "NaN" })).toThrow(
      /REDIS_COMMAND_TIMEOUT_MS/
    );
    expect(() => parseEnv({ REDIS_CONNECT_TIMEOUT_MS: "0" })).toThrow(
      /REDIS_CONNECT_TIMEOUT_MS/
    );
    expect(() => parseEnv({ REDIS_API_MAX_RETRIES_PER_REQUEST: "abc" })).toThrow(
      /REDIS_API_MAX_RETRIES_PER_REQUEST/
    );
  });

  it("limita o timeout de drenagem abaixo do stop_grace_period de 30s", () => {
    expect(parseEnv({ SHUTDOWN_DRAIN_TIMEOUT_MS: "25000" }).shutdownDrainTimeoutMs).toBe(
      25_000
    );
    expect(() => parseEnv({ SHUTDOWN_DRAIN_TIMEOUT_MS: "40000" })).toThrow(
      /SHUTDOWN_DRAIN_TIMEOUT_MS/
    );
  });

  it("falha o boot com PROCESS_ROLE inválido em produção", () => {
    expect(() => parseEnv({ NODE_ENV: "production", PROCESS_ROLE: "api-server" })).toThrow(
      /PROCESS_ROLE/
    );
  });

  it("avisa e usa o default para PROCESS_ROLE inválido fora de produção", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const env = parseEnv({ NODE_ENV: "development", PROCESS_ROLE: "api-server" });

    expect(env.processRole).toBe("all");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("PROCESS_ROLE"));
    warn.mockRestore();
  });

  it("aceita PROCESS_ROLE válidos sem avisar", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(parseEnv({ NODE_ENV: "production", PROCESS_ROLE: "worker" }).processRole).toBe(
      "worker"
    );
    expect(parseEnv({ NODE_ENV: "production", PROCESS_ROLE: " ALL " }).processRole).toBe(
      "all"
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("agrupa múltiplos erros em uma única mensagem", () => {
    expect(() => parseEnv({ PORT: "0", DB_POOL_MAX: "0" })).toThrow(/PORT[\s\S]*DB_POOL_MAX/);
  });
});
