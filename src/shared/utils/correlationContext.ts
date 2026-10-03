import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Padrão aceito pelo header `x-correlation-id` (mesmo do middleware).
 * IDs gerados aqui precisam satisfazê-lo para sobreviver a hops internos
 * que revalidam o header.
 */
const PADRAO_CORRELATION_ID = /^[A-Za-z0-9._:-]{8,100}$/;

const correlationStorage = new AsyncLocalStorage<string>();

/** correlationId do contexto atual (request, job ou cron), se houver. */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

/**
 * Envia `fn` para um escopo com correlationId específico. Padrão escolhido
 * (em vez de `enterWith`) porque o contexto é encerrado junto com a
 * execução — não vaza para requests keep-alive vizinhos, mesmo assim é
 * herdado por todo recurso assíncrono criado dentro de `fn`
 * (mesma semântica usada por `setRlsContext`).
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStorage.run(correlationId, fn);
}

/** Gera um correlationId autônomo (cron, dispatcher, job sem herança). */
export function newCorrelationId(prefixo: string): string {
  const limpo = prefixo.replace(/[^A-Za-z0-9._:-]/g, "-") || "autonomo";
  const uuid = randomUUID();
  return `${limpo.slice(0, 100 - uuid.length - 1)}:${uuid}`;
}

/** Escopo de correlação autônomo com id gerado no momento da execução. */
export function withCorrelationScope<T>(prefixo: string, fn: () => T): T {
  return correlationStorage.run(newCorrelationId(prefixo), fn);
}

/**
 * Correlação de um job BullMQ: prefere a herdada do request/cron que
 * enfileirou; caso contrário gera um id rastreável pelo nome da fila.
 */
export function jobCorrelationId(
  fila: string,
  jobId: string | undefined,
  herdado?: string,
): string {
  if (herdado && PADRAO_CORRELATION_ID.test(herdado)) return herdado;
  return newCorrelationId(`job:${fila}:${jobId ?? "sem-id"}`);
}

/**
 * Transforma um handler de cron/autônomo para que cada execução rode sob
 * um correlationId próprio (`cron:<nome>:<uuid>`).
 */
export function withCronCorrelation<T extends (...argumentos: any[]) => unknown>(
  nome: string,
  handler: T,
): T {
  return ((...argumentos: any[]) =>
    correlationStorage.run(newCorrelationId(`cron:${nome}`), () =>
      handler(...argumentos),
    )) as T;
}

/** Valida/normaliza um correlationId vindo de header HTTP. */
export function resolveCorrelationId(candidato: unknown): string {
  return typeof candidato === "string" && PADRAO_CORRELATION_ID.test(candidato)
    ? candidato
    : randomUUID();
}
