import {
  EvolutionConnectionState,
  fetchEvolutionConnectionStateStrict,
} from "@/shared/services/evolutionApiService";

export type AdminWhatsAppInstanceState = EvolutionConnectionState | "unreachable";

export interface AdminWhatsAppInstanceStateResult {
  state: AdminWhatsAppInstanceState;
  error?: string;
}

export type FetchInstanceState = (instanceName: string) => Promise<EvolutionConnectionState>;

export const INSTANCE_STATE_CONCURRENCY = 5;
export const INSTANCE_STATE_TIMEOUT_MS = 3_000;

const ERROR_TIMEOUT = "Evolution não respondeu a tempo";
const ERROR_UNAVAILABLE = "Evolution indisponível";

class InstanceStateTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new InstanceStateTimeoutError("timeout")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function shortError(error: unknown): string {
  if (error instanceof InstanceStateTimeoutError) return ERROR_TIMEOUT;
  return ERROR_UNAVAILABLE;
}

export const defaultFetchInstanceState: FetchInstanceState =
  fetchEvolutionConnectionStateStrict;

/**
 * Resolve o estado das instâncias com concorrência limitada (5 por vez) e
 * timeout por chamada (3 s). Uma falha isolada não derruba o restante: o
 * resultado é `unreachable` com um erro curto, sem stack e sem segredo.
 */
export async function resolveInstanceStates(
  instanceNames: string[],
  fetchState: FetchInstanceState = defaultFetchInstanceState,
  options?: { concurrency?: number; timeoutMs?: number }
): Promise<Map<string, AdminWhatsAppInstanceStateResult>> {
  const concurrency = Math.max(1, options?.concurrency ?? INSTANCE_STATE_CONCURRENCY);
  const timeoutMs = options?.timeoutMs ?? INSTANCE_STATE_TIMEOUT_MS;
  const results = new Map<string, AdminWhatsAppInstanceStateResult>();

  for (let index = 0; index < instanceNames.length; index += concurrency) {
    const chunk = instanceNames.slice(index, index + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((name) => withTimeout(fetchState(name), timeoutMs))
    );
    settled.forEach((outcome, position) => {
      const name = chunk[position];
      if (outcome.status === "fulfilled") {
        results.set(name, { state: outcome.value });
        return;
      }
      results.set(name, { state: "unreachable", error: shortError(outcome.reason) });
    });
  }

  return results;
}
