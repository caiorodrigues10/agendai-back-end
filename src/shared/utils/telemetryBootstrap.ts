/**
 * Bootstrap de telemetria.
 *
 * Este arquivo precisa ser o PRIMEIRO import de aplicação do processo de
 * entrada: os hooks do OpenTelemetry (`require-in-the-middle`) só patcham os
 * módulos carregados DEPOIS do `sdk.start()`. Se `ioredis`, `pg` ou `fastify`
 * já estiverem no cache de módulos quando o SDK subir, as spans/métricas
 * correspondentes simplesmente nunca aparecem.
 *
 * Por isso a ordem em `server.ts` é:
 *   1. `reflect-metadata`
 *   2. `tsconfig-paths/register`
 *   3. `@/shared/utils/telemetryBootstrap`  ← este arquivo, com efeito colateral
 *   4. todo o resto (env, container, prisma, redis, fastify…)
 *
 * O import abaixo é RELATIVO (não `@/`) de propósito: este arquivo tem que
 * resolver sem depender do alias já registrado, para não criar uma corrida
 * entre o registro dos paths e o bootstrap.
 *
 * Efeito colateral: sobe o SDK uma única vez quando `OTEL_ENABLED=true`.
 * O restante do código importa `tracingState` em vez de chamar `initTracing()`
 * de novo, para não haver dois SDKs concorrendo pela porta do Prometheus.
 */
import { initTracing } from "./tracing";

export const tracingState = initTracing();

/** Encerra o SDK de telemetria (idempotente). Usado na sequência de shutdown. */
export async function shutdownTracing(): Promise<void> {
  if (!tracingState) return;
  await tracingState.shutdown();
}
