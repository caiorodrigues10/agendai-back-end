export type AttentionProductSnap = {
  id: string;
  name: string;
  stockQty: number;
  minStock: number;
  trackStock: boolean;
  type: "RETAIL" | "CONSUMABLE" | "BOTH";
};

export type AttentionSaleRow = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
};

export type AttentionPurpose = "sale" | "own" | "both";

export type AttentionItem = {
  productId: string;
  name: string;
  stockQty: number;
  minStock?: number;
  quantity?: number;
  revenue?: number;
  margin?: number;
  daysOfCover?: number | null;
  purpose: AttentionPurpose;
};

export type ProductAttention = {
  missing: AttentionItem[];
  hot: AttentionItem[];
  needsReorder: AttentionItem[];
  idle: AttentionItem[];
};

function purposeOf(type: AttentionProductSnap["type"]): AttentionPurpose {
  if (type === "RETAIL") return "sale";
  if (type === "CONSUMABLE") return "own";
  return "both";
}

function periodDays(from?: Date, to?: Date): number {
  if (!from || !to) return 30;
  const ms = Math.max(0, to.getTime() - from.getTime());
  return Math.max(1, Math.ceil(ms / 86_400_000) || 1);
}

function daysOfCover(stockQty: number, soldQty: number, days: number): number | null {
  if (soldQty <= 0) return null;
  const daily = soldQty / days;
  if (daily <= 0) return null;
  return Math.round((stockQty / daily) * 10) / 10;
}

/**
 * Faixas acionáveis: faltando, bombando, atenção repor, parado.
 * Hot = top max(5, ceil(20% dos que venderam)), ordenado por quantidade.
 * NeedsReorder = hot e (estoque baixo ou cobertura < 7 dias).
 */
export function buildProductAttention(input: {
  products: AttentionProductSnap[];
  byProduct: AttentionSaleRow[];
  from?: Date;
  to?: Date;
}): ProductAttention {
  const days = periodDays(input.from, input.to);
  const productById = new Map(input.products.map((p) => [p.id, p]));
  const salesById = new Map(input.byProduct.map((row) => [row.productId, row]));

  const missing: AttentionItem[] = input.products
    .filter((p) => p.trackStock && p.minStock > 0 && p.stockQty <= p.minStock)
    .map((p) => ({
      productId: p.id,
      name: p.name,
      stockQty: p.stockQty,
      minStock: p.minStock,
      purpose: purposeOf(p.type),
      quantity: salesById.get(p.id)?.quantity,
      revenue: salesById.get(p.id)?.revenue,
    }))
    .sort((a, b) => a.stockQty - b.stockQty || a.name.localeCompare(b.name));

  const soldSorted = [...input.byProduct].sort(
    (a, b) => b.quantity - a.quantity || b.revenue - a.revenue
  );
  const hotCount = Math.max(5, Math.ceil(soldSorted.length * 0.2));
  const hotRows = soldSorted.slice(0, Math.min(hotCount, soldSorted.length));

  const hot: AttentionItem[] = hotRows.map((row) => {
    const product = productById.get(row.productId);
    const stockQty = product?.stockQty ?? 0;
    return {
      productId: row.productId,
      name: row.name,
      stockQty,
      minStock: product?.minStock,
      quantity: row.quantity,
      revenue: row.revenue,
      margin: row.margin,
      daysOfCover: daysOfCover(stockQty, row.quantity, days),
      purpose: product ? purposeOf(product.type) : "sale",
    };
  });

  const needsReorder: AttentionItem[] = hot.filter((item) => {
    const product = productById.get(item.productId);
    const low =
      product != null &&
      product.trackStock &&
      product.minStock > 0 &&
      product.stockQty <= product.minStock;
    const coverLow = item.daysOfCover != null && item.daysOfCover < 7;
    return low || coverLow;
  });

  const idle: AttentionItem[] = input.products
    .filter((p) => p.trackStock && p.stockQty > 0 && !salesById.has(p.id))
    .map((p) => ({
      productId: p.id,
      name: p.name,
      stockQty: p.stockQty,
      minStock: p.minStock,
      purpose: purposeOf(p.type),
    }))
    .sort((a, b) => b.stockQty - a.stockQty || a.name.localeCompare(b.name));

  return { missing, hot, needsReorder, idle };
}
