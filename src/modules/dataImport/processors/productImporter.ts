/**
 * Processador de linhas de produto (catálogo + estoque inicial).
 *
 * Regras:
 *   • identidade do produto: SKU → código de barras → nome normalizado. Com
 *     SKU repetido, o produto já existente é **ignorado** (a opção "atualizar
 *     produto existente" liga a atualização de preço/estoque mínimo);
 *   • o **saldo inicial nunca é gravado direto** em `stockQty`: ele vira um
 *     `StockMovement` do tipo `IMPORT` (saldo inicial). Não é compra — não
 *     gera `InventoryReceipt`, não vira despesa e não mexe no caixa;
 *   • o custo médio do estoque é recalculado com a mesma conta da compra
 *     (`weightedAverageCost`);
 *   • a categoria só é criada quando a opção "criar categoria" está ligada;
 *   • a coluna de imagem é ignorada (a importação não baixa imagem).
 */
import { normalizeMoney, normalizeQuantity } from "../utils/rowNormalization";
import { normalizeHeaderText } from "../utils/columnMapping";
import { weightedAverageCost, roundMoney, roundQty } from "@/modules/products/inventoryMath";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import type { AppTx } from "@/libs/prismaClient";

export interface ProductImportResult extends ProcessedRow {
  /** Movimento de estoque criado (saldo inicial). */
  movementId?: string | null;
}

export async function importProductRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<ProductImportResult> {
  const rawName = cellValue(row, context, "productName");
  const name = rawName.slice(0, 160);
  if (name.length < 2) {
    return {
      status: "FAILED",
      entityType: "PRODUCT",
      field: "productName",
      message: "Nome do produto ausente ou muito curto.",
    };
  }

  const sku = cellValue(row, context, "productSku").slice(0, 60) || null;
  const barcode = cellValue(row, context, "productBarcode").slice(0, 80) || null;

  const salePrice = normalizeMoney(cellValue(row, context, "salePrice"));
  if (salePrice === null && cellValue(row, context, "salePrice")) {
    return {
      status: "FAILED",
      entityType: "PRODUCT",
      field: "salePrice",
      message: "Preço de venda inválido. Use número, ex.: 50 ou 50,00.",
    };
  }

  const costPrice = normalizeMoney(cellValue(row, context, "costPrice"));
  if (costPrice === null && cellValue(row, context, "costPrice")) {
    return {
      status: "FAILED",
      entityType: "PRODUCT",
      field: "costPrice",
      message: "Custo inválido. Use número, ex.: 20 ou 20,00.",
    };
  }

  const stockQty = normalizeQuantity(cellValue(row, context, "stockQty"));
  if (stockQty === null && cellValue(row, context, "stockQty")) {
    return {
      status: "FAILED",
      entityType: "PRODUCT",
      field: "stockQty",
      message: "Saldo inicial inválido. Use número, ex.: 10 ou 10,5.",
    };
  }

  const minStock = normalizeQuantity(cellValue(row, context, "minStock"));
  if (minStock === null && cellValue(row, context, "minStock")) {
    return {
      status: "FAILED",
      entityType: "PRODUCT",
      field: "minStock",
      message: "Estoque mínimo inválido. Use número, ex.: 2.",
    };
  }

  const warnings: string[] = [];
  if (cellValue(row, context, "productImage")) {
    warnings.push("A coluna de imagem foi ignorada: a importação não baixa imagem de produto.");
  }

  const existing = await findExistingProduct(tx, barbershopId, { sku, barcode, name });

  if (existing) {
    if (!context.options.updateExistingProducts) {
      return {
        status: "SKIPPED",
        entityType: "PRODUCT",
        entityId: existing.id,
        message: "Produto já existe no catálogo (mesmo SKU, código de barras ou nome).",
        warnings,
      };
    }

    // Atualização parcial: preço de venda e estoque mínimo. O saldo continua
    // sendo controlado por movimentos — a importação nunca sobrescreve
    // `stockQty` de um produto que já tem histórico.
    const updated = await tx.product.update({
      where: { id: existing.id },
      data: {
        ...(salePrice !== null ? { salePrice } : {}),
        ...(minStock !== null ? { minStock } : {}),
      },
      select: { id: true, salePrice: true, minStock: true, stockQty: true, averageCost: true },
    });

    let movementId: string | null = null;
    let appliedStock = updated.stockQty;
    let appliedAverageCost = updated.averageCost;
    if (stockQty && stockQty > 0) {
      const movement = await writeInitialStock(tx, {
        barbershopId,
        productId: updated.id,
        quantity: stockQty,
        unitCost: costPrice ?? updated.averageCost,
        currentStock: updated.stockQty,
        currentAverageCost: updated.averageCost,
        actingUserId: context.actingUserId,
        batchId: context.batchId,
      });
      movementId = movement.id;
      appliedStock = movement.stockAfter;
      appliedAverageCost = movement.averageCostAfter;
    }

    return {
      status: "IMPORTED",
      entityType: "PRODUCT",
      entityId: updated.id,
      warnings,
      movementId,
      previousState: {
        before: {
          salePrice: existing.salePrice,
          minStock: existing.minStock,
          stockQty: existing.stockQty,
          averageCost: existing.averageCost,
        },
        applied: {
          salePrice: updated.salePrice,
          minStock: updated.minStock,
          stockQty: appliedStock,
          averageCost: appliedAverageCost,
        },
      },
    };
  }

  const category = await resolveCategory(tx, barbershopId, cellValue(row, context, "productCategory"), context.options.createProductCategories);
  if (category.status === "CREATED") {
    warnings.push(`Categoria "${category.name}" foi criada pela importação.`);
  }
  if (category.status === "MISSING") {
    warnings.push(`Categoria "${category.name}" não existe e não foi criada (opção desligada): o produto entra sem categoria.`);
  }

  const unit = resolveUnit(cellValue(row, context, "productUnit"));
  const unitLabel = cellValue(row, context, "productUnitLabel").slice(0, 40) || null;
  const type = resolveProductType(cellValue(row, context, "productType"));
  const trackStock = stockQty !== null || minStock !== null;

  const created = await tx.product.create({
    data: {
      barbershopId,
      ...(category.categoryId ? { categoryId: category.categoryId } : {}),
      name,
      description: cellValue(row, context, "productDescription").slice(0, 400) || null,
      sku,
      barcode,
      unit,
      unitLabel: unitLabel ?? "unidade",
      salePrice: salePrice ?? 0,
      averageCost: 0,
      stockQty: 0,
      minStock: minStock ?? 0,
      active: true,
      type,
      trackStock,
    },
    select: { id: true, stockQty: true, averageCost: true },
  });

  let movementId: string | null = null;
  if (stockQty && stockQty > 0) {
    const movement = await writeInitialStock(tx, {
      barbershopId,
      productId: created.id,
      quantity: stockQty,
      unitCost: costPrice ?? 0,
      currentStock: created.stockQty,
      currentAverageCost: created.averageCost,
      actingUserId: context.actingUserId,
      batchId: context.batchId,
    });
    movementId = movement.id;
  } else if (costPrice && costPrice > 0) {
    // Sem saldo inicial, o custo informado vira o custo base do produto.
    await tx.product.update({
      where: { id: created.id },
      data: { averageCost: roundMoney(costPrice) },
    });
  }

  return {
    status: "IMPORTED",
    entityType: "PRODUCT",
    entityId: created.id,
    warnings,
    movementId,
    createdCategoryId: category.createdCategoryId,
    previousState: null,
  };
}

/** Produto existente por SKU, código de barras ou nome normalizado. */
async function findExistingProduct(
  tx: AppTx,
  barbershopId: string,
  input: { sku: string | null; barcode: string | null; name: string },
) {
  if (input.sku) {
    const bySku = await tx.product.findFirst({
      where: { barbershopId, sku: input.sku },
      select: { id: true, salePrice: true, minStock: true, stockQty: true, averageCost: true },
    });
    if (bySku) return bySku;
  }
  if (input.barcode) {
    const byBarcode = await tx.product.findFirst({
      where: { barbershopId, barcode: input.barcode },
      select: { id: true, salePrice: true, minStock: true, stockQty: true, averageCost: true },
    });
    if (byBarcode) return byBarcode;
  }
  const key = normalizeHeaderText(input.name);
  if (!key) return null;
  const candidates = await tx.product.findMany({
    where: { barbershopId },
    select: { id: true, name: true, salePrice: true, minStock: true, stockQty: true, averageCost: true },
    take: 50,
  });
  const match = candidates.find((candidate) => normalizeHeaderText(candidate.name) === key);
  return match
    ? {
        id: match.id,
        salePrice: match.salePrice,
        minStock: match.minStock,
        stockQty: match.stockQty,
        averageCost: match.averageCost,
      }
    : null;
}

type CategoryResolution =
  | { status: "FOUND"; categoryId: string | null; createdCategoryId: null; name: string }
  | { status: "CREATED"; categoryId: string; createdCategoryId: string; name: string }
  | { status: "MISSING"; categoryId: null; createdCategoryId: null; name: string };

async function resolveCategory(
  tx: AppTx,
  barbershopId: string,
  rawName: string,
  createIfMissing: boolean,
): Promise<CategoryResolution> {
  const name = rawName.trim().slice(0, 80);
  if (!name) return { status: "FOUND", categoryId: null, createdCategoryId: null, name: "" };

  const key = normalizeHeaderText(name);
  const existing = await tx.productCategory.findMany({
    where: { barbershopId },
    select: { id: true, name: true },
  });
  const match = existing.find((category) => normalizeHeaderText(category.name) === key);
  if (match) return { status: "FOUND", categoryId: match.id, createdCategoryId: null, name };

  if (!createIfMissing) {
    return { status: "MISSING", categoryId: null, createdCategoryId: null, name };
  }

  const created = await tx.productCategory.create({
    data: { barbershopId, name, active: true },
    select: { id: true },
  });
  return { status: "CREATED", categoryId: created.id, createdCategoryId: created.id, name };
}

/**
 * Grava o saldo inicial como movimento de estoque do tipo `IMPORT`.
 *
 * Não é compra: não há `InventoryReceipt`, não há despesa e não há caixa.
 * O saldo do produto passa a ser a soma dos movimentos — como sempre.
 */
async function writeInitialStock(
  tx: AppTx,
  input: {
    barbershopId: string;
    productId: string;
    quantity: number;
    unitCost: number;
    currentStock: number;
    currentAverageCost: number;
    actingUserId: string;
    batchId: string;
  },
): Promise<{ id: string; stockAfter: number; averageCostAfter: number }> {
  const quantity = roundQty(input.quantity);
  const stockBefore = roundQty(input.currentStock);
  const stockAfter = roundQty(stockBefore + quantity);
  const averageCostAfter = weightedAverageCost(
    stockBefore,
    input.currentAverageCost,
    quantity,
    input.unitCost,
  );

  const movement = await tx.stockMovement.create({
    data: {
      barbershopId: input.barbershopId,
      productId: input.productId,
      type: "IMPORT",
      quantity,
      unitCost: roundMoney(input.unitCost),
      stockBefore,
      stockAfter,
      sourceType: "data_import",
      sourceId: input.batchId,
      reason: "Saldo inicial importado",
      createdById: input.actingUserId,
    },
    select: { id: true },
  });

  await tx.product.update({
    where: { id: input.productId },
    data: { stockQty: stockAfter, averageCost: averageCostAfter },
  });

  return { id: movement.id, stockAfter, averageCostAfter };
}

/** Unidade de medida aceita na planilha. */
export function resolveUnit(raw: string): "UNIT" | "ML" | "L" | "G" | "KG" | "BOX" | "PACK" | "OTHER" {
  const key = normalizeHeaderText(raw);
  switch (key) {
    case "un":
    case "unidade":
    case "unit":
    case "pc":
    case "peca":
      return "UNIT";
    case "ml":
    case "mililitro":
    case "mililitros":
      return "ML";
    case "l":
    case "litro":
    case "litros":
      return "L";
    case "g":
    case "grama":
    case "gramas":
      return "G";
    case "kg":
    case "quilo":
    case "quilos":
    case "quilograma":
      return "KG";
    case "caixa":
    case "cx":
    case "box":
      return "BOX";
    case "pacote":
    case "pct":
    case "pack":
      return "PACK";
    default:
      return "OTHER";
  }
}

/** Tipo do produto aceito na planilha. */
export function resolveProductType(raw: string): "RETAIL" | "CONSUMABLE" | "BOTH" {
  const key = normalizeHeaderText(raw);
  if (["consumo", "consumivel", "consumable", "uso interno", "interno"].includes(key)) return "CONSUMABLE";
  if (["ambos", "both", "venda e consumo"].includes(key)) return "BOTH";
  return "RETAIL";
}
