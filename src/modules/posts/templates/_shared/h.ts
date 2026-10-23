/**
 * Helper h() — hyperscript mínimo (estilo React.createElement) p/ construir a
 * árvore que o Satori consome, SEM React e sem JSX no backend (tsconfig intocado).
 */
export type VNode = { type: string; props: Record<string, unknown> };

export function h(
  type: string,
  props: Record<string, unknown> | null = null,
  ...children: unknown[]
): VNode {
  const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { ...(props || {}), children: flat } };
}
