/**
 * Definição única de "estoque baixo" — a forma **em memória** da regra.
 *
 * Regra: produto que **controla estoque** (`trackStock`), com **mínimo
 * configurado** (`minStock > 0`) e **estoque no ou abaixo do mínimo**
 * (`stockQty <= minStock`).
 *
 * `active` **não** faz parte da definição: quem decide se produto inativo entra
 * no recorte é o chamador (dashboard e financeiro filtram `active = true`; a
 * listagem só filtra quando a query pede).
 *
 * Este módulo é **puro** (nenhum import de banco): ele é usado tanto pelos
 * pontos que filtram em memória (dashboard, atenção, bot do dono) quanto —
 * através das constantes `LOW_STOCK_RULE` — pelas formas de consulta
 * (`lowStockWhere` / `lowStockSql` em `repositories/lowStockWhere.ts`).
 */
export const LOW_STOCK_RULE = {
  /** Só produto que controla estoque entra na regra. */
  trackStock: true,
  /** Mínimo precisa estar configurado (maior que zero). */
  minStockGreaterThan: 0,
} as const;

/** Formato mínimo do produto para avaliar a regra em memória. */
export interface LowStockProductLike {
  trackStock: boolean;
  minStock: number;
  stockQty: number;
}

/**
 * `true` quando o produto está em estoque baixo segundo a definição acima.
 */
export function isLowStock(product: LowStockProductLike): boolean {
  return (
    product.trackStock === LOW_STOCK_RULE.trackStock &&
    product.minStock > LOW_STOCK_RULE.minStockGreaterThan &&
    product.stockQty <= product.minStock
  );
}
