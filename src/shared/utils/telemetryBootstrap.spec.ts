/// <reference types="vitest/globals" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * B19: a ordem de bootstrap da telemetria é o próprio valor do item.
 *
 * Os hooks do OpenTelemetry (require-in-the-middle) só patcham módulos
 * carregados DEPOIS do `sdk.start()`. Se `server.ts` importar `ioredis`/`pg`
 * antes do bootstrap, as spans de Redis/Postgres nunca aparecem — e o tipo
 * compila perfeitamente, então só uma checagem de ordem pega a regressão.
 */
describe("bootstrap de telemetria (B19)", () => {
  const serverPath = resolve(__dirname, "../infra/http/server.ts");
  const serverSource = readFileSync(serverPath, "utf8");

  /** Posição do primeiro import/require que casar, ou -1. */
  function pos(pattern: RegExp | string): number {
    const match =
      typeof pattern === "string"
        ? serverSource.indexOf(pattern)
        : serverSource.search(pattern);
    return match;
  }

  it("importa o bootstrap antes de qualquer módulo que conecte", () => {
    const bootstrap = pos("telemetryBootstrap");
    expect(bootstrap).toBeGreaterThan(-1);

    const queConectam = [
      "@/config/env",
      "@/shared/container",
      "@/libs/prismaClient",
      "@/shared/infra/queue/redisConnection",
      "./app",
    ];
    for (const modulo of queConectam) {
      const p = pos(modulo);
      expect(p, `import de ${modulo} veio antes do bootstrap`).toBeGreaterThan(
        bootstrap,
      );
    }
  });

  it("não chama initTracing duas vezes no processo de entrada", () => {
    expect(serverSource).not.toMatch(/import\s*\{\s*initTracing\s*\}/);
    expect(serverSource).not.toMatch(/initTracing\s*\(\s*\)/);
  });

  it("encerra o tracing na sequência de shutdown", () => {
    expect(serverSource).toMatch(/runStep\(\s*['"]encerrar tracing['"]\s*,\s*shutdownTracing/);
  });

  it("usa a instrumentação de ioredis e não a de redis v4", async () => {
    const tracing = readFileSync(resolve(__dirname, "tracing.ts"), "utf8");
    expect(tracing).toContain("IORedisInstrumentation");
    expect(tracing).not.toContain("instrumentation-redis-4");
  });

  it("shutdownTracing é idempotente e seguro sem SDK ativo", async () => {
    const { shutdownTracing, tracingState } = await import(
      "./telemetryBootstrap"
    );
    // O teste roda com OTEL_ENABLED !== 'true' → SDK ausente.
    expect(tracingState).toBeNull();
    await expect(shutdownTracing()).resolves.toBeUndefined();
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });
});
