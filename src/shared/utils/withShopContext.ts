import { requestContext } from "@/shared/infra/http/requestContext";

/**
 * Executa `fn` com o contexto RLS (`app.current_barbershop_id`) apontando para
 * `resolvedShopId`. Quando o salão resolvido já é o da sessão (`setRlsContext`
 * deixou o salão do token no AsyncLocalStorage), roda direto — o contexto já está
 * correto e não precisa de `run` aninhado. Sem essa troca no cross-salão, a policy
 * `tenant_isolation` filtra pelo salão errado e a leitura retorna vazia/alheia.
 *
 * Use para QUALQUER leitura feita em nome de um salão resolvido por
 * `resolveOrgAccessToBarbershop` (ex.: dashboard multiunidades, financeiro cross-shop).
 */
export function withShopContext<T>(
  sessionShopId: string | undefined,
  resolvedShopId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (resolvedShopId === sessionShopId) return fn();
  return requestContext.run({ barbershopId: resolvedShopId }, fn);
}
