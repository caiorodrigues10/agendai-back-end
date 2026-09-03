export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function remainingFiadoAmount(
  originalAmount: number,
  paidAmount: number,
  creditAdjustedAmount = 0
): number {
  return Math.max(0, roundMoney(originalAmount - paidAmount - creditAdjustedAmount));
}

export function weightedAverageCost(
  stockQty: number,
  averageCost: number,
  deltaQty: number,
  unitCost: number
): number {
  const nextQty = roundQty(stockQty + deltaQty);
  if (nextQty <= 0) return 0;
  if (deltaQty > 0 && stockQty <= 0) return roundMoney(unitCost);
  const nextValue = stockQty * averageCost + deltaQty * unitCost;
  return roundMoney(Math.max(0, nextValue / nextQty));
}

export function nextStockQty(current: number, signedQty: number, trackStock: boolean): number {
  const next = roundQty(current + signedQty);
  if (trackStock && next < -0.0001) {
    const err = new Error("INSUFFICIENT_STOCK");
    err.name = "INSUFFICIENT_STOCK";
    throw err;
  }
  return Math.max(0, next);
}

export type PlannedStockLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  trackStock: boolean;
  stockBefore: number;
  stockAfter: number;
  averageCostAfter: number;
};

export type CatalogProductSnapshot = {
  id: string;
  barbershopId: string;
  name: string;
  active: boolean;
  type: "RETAIL" | "CONSUMABLE" | "BOTH";
  trackStock: boolean;
  stockQty: number;
  salePrice: number;
  averageCost: number;
};

export type SalePlanItem = {
  productId: string;
  quantity: number;
  unitPrice?: number;
};

export function planRetailSaleLines(
  products: CatalogProductSnapshot[],
  items: SalePlanItem[],
  opts: { barbershopId: string; allowPriceOverride: boolean }
): PlannedStockLine[] {
  if (!items.length) {
    throw Object.assign(new Error("Informe ao menos um produto"), { statusCode: 400 });
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const merged = new Map<string, { quantity: number; unitPrice?: number }>();
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw Object.assign(new Error("Quantidade inválida"), { statusCode: 400 });
    }
    const prev = merged.get(item.productId);
    merged.set(item.productId, {
      quantity: roundQty((prev?.quantity ?? 0) + item.quantity),
      unitPrice: item.unitPrice ?? prev?.unitPrice,
    });
  }

  return [...merged.entries()].map(([productId, item]) => {
    const product = byId.get(productId);
    if (!product || product.barbershopId !== opts.barbershopId) {
      throw Object.assign(new Error("Produto não encontrado neste salão"), { statusCode: 404 });
    }
    if (!product.active) {
      throw Object.assign(new Error(`"${product.name}" está inativo e não pode ser vendido`), { statusCode: 400 });
    }
    if (product.type === "CONSUMABLE") {
      throw Object.assign(new Error(`"${product.name}" é de uso interno e não pode ser vendido`), { statusCode: 400 });
    }
    const unitPrice = opts.allowPriceOverride && item.unitPrice != null
      ? roundMoney(item.unitPrice)
      : roundMoney(product.salePrice);
    if (unitPrice < 0) {
      throw Object.assign(new Error("Preço inválido"), { statusCode: 400 });
    }
    const stockAfter = nextStockQty(product.stockQty, -item.quantity, product.trackStock);
    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice,
      unitCost: roundMoney(product.averageCost),
      trackStock: product.trackStock,
      stockBefore: product.stockQty,
      stockAfter,
      averageCostAfter: product.averageCost,
    };
  });
}

export function planPurchaseLines(
  products: CatalogProductSnapshot[],
  items: Array<{ productId: string; quantity: number; unitCost: number }>,
  barbershopId: string
): PlannedStockLine[] {
  if (!items.length) {
    throw Object.assign(new Error("Informe ao menos um item na compra"), { statusCode: 400 });
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((item) => {
    const product = byId.get(item.productId);
    if (!product || product.barbershopId !== barbershopId) {
      throw Object.assign(new Error("Produto não encontrado neste salão"), { statusCode: 404 });
    }
    if (item.quantity <= 0 || item.unitCost < 0) {
      throw Object.assign(new Error("Quantidade e custo da compra devem ser positivos"), { statusCode: 400 });
    }
    const stockAfter = nextStockQty(product.stockQty, item.quantity, false);
    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice: 0,
      unitCost: roundMoney(item.unitCost),
      trackStock: product.trackStock,
      stockBefore: product.stockQty,
      stockAfter,
      averageCostAfter: weightedAverageCost(product.stockQty, product.averageCost, item.quantity, item.unitCost),
    };
  });
}

export type TemplateName = { name: string };

export function namesToSkip(existing: TemplateName[], suggested: TemplateName[]): Set<string> {
  const have = new Set(existing.map((row) => row.name.trim().toLowerCase()));
  return new Set(
    suggested
      .filter((row) => have.has(row.name.trim().toLowerCase()))
      .map((row) => row.name.trim().toLowerCase())
  );
}
