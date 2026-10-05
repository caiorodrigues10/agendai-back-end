import { inject, injectable } from "tsyringe";
import { randomUUID } from "node:crypto";
import { prisma, Prisma, type AppTx } from "@/libs/prismaClient";
import type { ProductType as ProductTypeEnum } from "@prisma/client";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { getModuleLogger } from "@/shared/utils/logger";
import { InventoryEngine } from "../infra/InventoryEngine";
import {
  assertProductPermission,
  canOverrideProductPrice,
  canGiveDiscount,
  canSeeProductCosts,
  canSeeReservationCustomer,
  ProductActor,
} from "../permissions";
import { CATALOG_TEMPLATE_VERSION, getCatalogTemplate } from "../catalogTemplates";
import type { BusinessSegment } from "@/modules/barbershops/dtos/IBarbershopResponseDTO";
import { namesToSkip } from "../inventoryMath";
import { productTypeWhere } from "../productListFilters";
import { assertProductsInventoryCapability } from "@/shared/constants/productsInventory";
import {
  assertUniqueProductCode,
  isProductUniqueViolation,
  normalizeCode,
  throwProductUniqueViolation,
} from "../utils/productCodeUtils";
import { summarizeRetailLines } from "../utils/retailSummary";
import { buildProductAttention } from "../utils/productAttention";
import { resolveUnitFields } from "../utils/productStockUnit";
import {
  getShopToday,
  getExpirationStatus,
  expirationWhere,
  EXPIRING_SOON_DAYS,
} from "../utils/productExpiration";

type ProductListItem = Record<string, unknown> & { averageCost?: number; expirationDate?: Date | null; type?: string };

function stripCost<T extends ProductListItem>(row: T, showCost: boolean): T {
  if (showCost) return row;
  const { averageCost: _cost, ...rest } = row;
  void _cost;
  return rest as T;
}

function enrichExpiration(row: ProductListItem, todayISO: string, days: number): ProductListItem {
  if (!row.expirationDate || (row.type !== "CONSUMABLE" && row.type !== "BOTH")) {
    const { expirationDate: _, ...rest } = row;
    return { ...rest, expirationStatus: null, daysToExpire: null };
  }
  const status = getExpirationStatus(row.expirationDate, todayISO, days);
  const expStr = row.expirationDate.toISOString().slice(0, 10);
  const diffMs = new Date(expStr).getTime() - new Date(todayISO).getTime();
  const daysToExpire = Math.round(diffMs / 86_400_000);
  const { expirationDate: _, ...rest } = row;
  return { ...rest, expirationStatus: status, daysToExpire };
}

/** Reserva vigente devolvida no card do catálogo (só com permissão de cliente). */
type ReservationDetail = {
  id: string;
  customerName: string;
  whatsapp: string;
  quantity: number;
  expiresAt: Date;
};

type ReservedEntry = { reservedQty: number; reservations: ReservationDetail[] };
type ReservedMap = Map<string, ReservedEntry>;

@injectable()
export class ProductCatalogUseCase {
  constructor(
    @inject(InventoryEngine) private engine: InventoryEngine,
    @inject("StorageProvider") private storage: IStorageProvider,
  ) {}

  /**
   * Reservas vigentes (RESERVED e não vencidas) dos produtos de UMA página —
   * uma única consulta, nunca N+1. A soma alimenta `reservedQty`/`availableQty`
   * e o array `reservations` só é montado quando o usuário pode ver o cliente.
   *
   * Fora de `prisma.$transaction` de propósito (P2028 da extensão de RLS).
   * `status`/`expiresAt` são filtrados na query e conferidos de novo em
   * memória: vencida ou finalizada nunca entra no card.
   */
  private async reservationsForPage(
    barbershopId: string,
    productIds: string[],
    includeCustomer: boolean,
  ): Promise<ReservedMap> {
    const map: ReservedMap = new Map();
    if (productIds.length === 0) return map;

    const now = new Date();
    const rows = await prisma.productReservation.findMany({
      where: {
        barbershopId,
        productId: { in: productIds },
        status: "RESERVED",
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        productId: true,
        quantity: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        ...(includeCustomer ? { customerName: true, whatsapp: true } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    for (const row of rows as Array<{
      id: string;
      productId: string;
      quantity: number;
      status: string;
      expiresAt: Date;
      createdAt: Date;
      customerName?: string;
      whatsapp?: string;
    }>) {
      if (row.status !== "RESERVED" || row.expiresAt.getTime() <= now.getTime()) continue;
      const entry = map.get(row.productId) ?? { reservedQty: 0, reservations: [] };
      entry.reservedQty += Number(row.quantity);
      if (includeCustomer) {
        entry.reservations.push({
          id: row.id,
          customerName: row.customerName ?? "",
          whatsapp: row.whatsapp ?? "",
          quantity: Number(row.quantity),
          expiresAt: row.expiresAt,
        });
      }
      map.set(row.productId, entry);
    }
    return map;
  }

  /** Anexa `reservedQty`, `availableQty` e (se permitido) `reservations`. */
  private withReservations(
    row: ProductListItem,
    map: ReservedMap,
    includeCustomer: boolean,
  ): ProductListItem {
    const entry = map.get(String(row.id));
    const reservedQty = entry?.reservedQty ?? 0;
    const trackStock = (row as { trackStock?: boolean }).trackStock ?? true;
    const availableQty = trackStock
      ? Math.max(0, Number(row.stockQty ?? 0) - reservedQty)
      : null;
    return {
      ...row,
      reservedQty,
      availableQty,
      ...(includeCustomer ? { reservations: entry?.reservations ?? [] } : {}),
    };
  }

  async listProducts(barbershopId: string, user: ProductActor, query: {
    search?: string; categoryId?: string; active?: string; type?: string; purpose?: "sale" | "own"; lowStock?: string; forSale?: string; expiry?: "expired" | "expiring"; days?: number; page: number; limit: number;
  }) {
    const perms = await assertProductPermission(user, barbershopId, ["PRODUCTS_VIEW", "PRODUCTS_MANAGE", "RETAIL_SELL", "INVENTORY_MANAGE"]);
    const showCost = canSeeProductCosts(user, perms);
    const showCustomer = canSeeReservationCustomer(user, perms);
    const shop = await prisma.barbershop.findUnique({ where: { id: barbershopId }, select: { timezone: true } });
    const shopTz = shop?.timezone ?? "America/Sao_Paulo";
    const todayISO = getShopToday(shopTz);
    const days = query.days ?? EXPIRING_SOON_DAYS;
    const where: Prisma.ProductWhereInput = { barbershopId };
    if (query.active) where.active = query.active === "true";
    if (query.categoryId) where.categoryId = query.categoryId;
    const typeFilter = productTypeWhere(query);
    if (typeFilter) Object.assign(where, typeFilter);
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { sku: { contains: query.search, mode: "insensitive" } },
        { barcode: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.expiry) {
      const expiryFilter = expirationWhere(query.expiry, todayISO, days);
      // Merge via AND to not override the OR from search
      const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [...existingAnd, expiryFilter];
    }

    if (query.lowStock === "true") {
      const skip = (query.page - 1) * query.limit;
      const lowStockClauses: Prisma.Sql[] = [
        Prisma.sql`"barbershopId" = ${barbershopId}::uuid`,
        Prisma.sql`"trackStock" = true`,
        Prisma.sql`"minStock" > 0`,
        Prisma.sql`"stockQty" <= "minStock"`,
      ];
      if (query.active) lowStockClauses.push(Prisma.sql`active = ${query.active === "true"}`);
      if (query.categoryId) lowStockClauses.push(Prisma.sql`"categoryId" = ${query.categoryId}::uuid`);
      const typeFilter = productTypeWhere(query);
      if (typeFilter) {
        if (typeof typeFilter.type === "string") {
          lowStockClauses.push(Prisma.sql`type = ${typeFilter.type}::"ProductType"`);
        } else {
          lowStockClauses.push(Prisma.sql`type IN (${Prisma.join(typeFilter.type.in.map((type) => Prisma.sql`${type}::"ProductType"`))})`);
        }
      }
      if (query.search) {
        const search = `%${query.search}%`;
        lowStockClauses.push(Prisma.sql`(name ILIKE ${search} OR sku ILIKE ${search} OR barcode ILIKE ${search})`);
      }
      const lowStockWhere = Prisma.sql`${Prisma.join(lowStockClauses, " AND ")}`;
      const [idRows, countRows] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>`
          SELECT id::text AS id FROM products
          WHERE ${lowStockWhere}
          ORDER BY name ASC
          LIMIT ${query.limit} OFFSET ${skip}
        `,
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::bigint AS count FROM products
          WHERE ${lowStockWhere}
        `,
      ]);
      const ids = idRows.map((row: { id: string }) => row.id);
      const rows = ids.length
        ? await prisma.product.findMany({
            where: { id: { in: ids } },
            include: { category: true },
          })
        : [];
      const order = new Map<string, number>(ids.map((id: string, index: number) => [id, index]));
      rows.sort((a: { id: string }, b: { id: string }) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const total = Number(countRows[0]?.count ?? 0);
      const reserved = await this.reservationsForPage(barbershopId, ids, showCustomer);
      return {
        data: rows.map((row: ProductListItem) =>
          this.withReservations(enrichExpiration(stripCost(row, showCost), todayISO, days), reserved, showCustomer),
        ),
        total,
      };
    }

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.product.count({ where }),
    ]);
    const reserved = await this.reservationsForPage(
      barbershopId,
      rows.map((row: { id: string }) => row.id),
      showCustomer,
    );
    const data = rows.map((row: ProductListItem) =>
      this.withReservations(enrichExpiration(stripCost(row, showCost), todayISO, days), reserved, showCustomer),
    );
    return { data, total };
  }

  async listPublicSaleProducts(barbershopId: string) {
    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { id: true },
    });
    if (!shop) throw new AppError("SalÃ£o nÃ£o encontrado", 404);

    return prisma.product.findMany({
      where: {
        barbershopId,
        active: true,
        salePrice: { gt: 0 },
        type: { in: ["RETAIL", "BOTH"] as ProductTypeEnum[] },
        OR: [{ trackStock: false }, { stockQty: { gt: 0 } }],
      },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        salePrice: true,
        stockQty: true,
        trackStock: true,
        unitLabel: true,
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ name: "asc" }],
      take: 20,
    });
  }

  async createProduct(barbershopId: string, user: ProductActor, data: Prisma.ProductUncheckedCreateInput) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    if (data.categoryId) {
      const category = await prisma.productCategory.findFirst({ where: { id: data.categoryId, barbershopId } });
      if (!category) throw new AppError("Categoria não encontrada neste salão", 404);
    }
    const sku = normalizeCode(data.sku as string | null | undefined);
    const barcode = normalizeCode(data.barcode as string | null | undefined);
    await assertUniqueProductCode({ barbershopId, sku, barcode });
    // Resolve unit fields from payload
    const unitFields = resolveUnitFields({
      unit: data.unit as string | undefined,
      unitLabel: data.unitLabel as string | undefined,
    });
    // Normalize: if type is RETAIL, clear expirationDate and lotNumber
    const effectiveType = (data.type as string) ?? "RETAIL";
    const isRetail = effectiveType === "RETAIL";
    // Estoque inicial no cadastro: quem não controla estoque nasce com saldo 0.
    const { initialStock, ...rest } = data as Prisma.ProductUncheckedCreateInput & {
      initialStock?: number;
    };
    const requestedQty = Number(initialStock);
    const openingQty =
      rest.trackStock !== false && Number.isFinite(requestedQty) && requestedQty > 0
        ? requestedQty
        : 0;
    try {
      return await prisma.$transaction(async (tx: any) => {
        const product = await tx.product.create({
          data: {
            ...rest,
            barbershopId,
            sku,
            barcode,
            stockQty: openingQty,
            averageCost: 0,
            ...(unitFields?.unit !== undefined ? { unit: unitFields.unit } : {}),
            ...(unitFields?.unitLabel != null ? { unitLabel: unitFields.unitLabel } : {}),
            expirationDate: isRetail ? null : (data.expirationDate as Date | null | undefined) ?? null,
            lotNumber: isRetail ? null : (data.lotNumber as string | null | undefined) ?? null,
          },
        });
        // Toda entrada de saldo com origem precisa de movimentação de estoque.
        if (openingQty > 0) {
          await tx.stockMovement.create({
            data: {
              barbershopId,
              productId: product.id,
              type: "MANUAL_ADJUSTMENT",
              quantity: openingQty,
              unitCost: 0,
              stockBefore: 0,
              stockAfter: openingQty,
              sourceType: "initial_stock",
              sourceId: product.id,
              reason: "Estoque inicial no cadastro",
              createdById: user.id,
            },
          });
        }
        return product;
      });
    } catch (error) {
      if (isProductUniqueViolation(error)) throwProductUniqueViolation();
      throw error;
    }
  }

  async updateProduct(id: string, barbershopId: string, user: ProductActor, data: Prisma.ProductUncheckedUpdateInput) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const product = await prisma.product.findFirst({ where: { id, barbershopId } });
    if (!product) throw new AppError("Produto não encontrado", 404);
    if (data.categoryId) {
      const category = await prisma.productCategory.findFirst({ where: { id: String(data.categoryId), barbershopId } });
      if (!category) throw new AppError("Categoria não encontrada neste salão", 404);
    }
    const sku = data.sku !== undefined ? normalizeCode(data.sku as string | null) : undefined;
    const barcode = data.barcode !== undefined ? normalizeCode(data.barcode as string | null) : undefined;
    await assertUniqueProductCode({
      barbershopId,
      sku: sku !== undefined ? sku : product.sku,
      barcode: barcode !== undefined ? barcode : product.barcode,
      excludeId: id,
    });
    // Resolve unit fields from payload
    const unitFields = data.unit !== undefined || data.unitLabel !== undefined
      ? resolveUnitFields({
          unit: data.unit as string | null | undefined,
          unitLabel: data.unitLabel as string | null | undefined,
        })
      : undefined;
    // Normalize: if type result is RETAIL, clear expirationDate and lotNumber
    const effectiveType = ((data.type as string) ?? product.type) as string;
    const isRetail = effectiveType === "RETAIL";
    const updateData: Prisma.ProductUncheckedUpdateInput = {
      ...data,
      ...(sku !== undefined ? { sku } : {}),
      ...(barcode !== undefined ? { barcode } : {}),
      ...(unitFields?.unit !== undefined ? { unit: unitFields.unit } : {}),
      ...(unitFields?.unitLabel != null ? { unitLabel: unitFields.unitLabel } : {}),
    };
    if (isRetail) {
      updateData.expirationDate = null;
      updateData.lotNumber = null;
    }
    try {
      return await prisma.product.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (isProductUniqueViolation(error)) throwProductUniqueViolation();
      throw error;
    }
  }

  /**
   * Apaga o produto de vez. Só é permitido quando não há histórico
   * (stock_movements, inventory_receipt_items, retail_sale_lines,
   * retail_sale_refund_lines) nem reserva RESERVED vigente — nesse caso a
   * recomendação é Inativar. Reservas finalizadas caem em cascata.
   *
   * Fora de `prisma.$transaction` de propósito: a extensão de RLS
   * (`libs/prismaExtensions.ts`) roteia operações de model para outra conexão
   * do pool e derruba a transação com P2028.
   */
  async deleteProduct(id: string, barbershopId: string, user: ProductActor) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const product = await prisma.product.findFirst({ where: { id, barbershopId } });
    if (!product) throw new AppError("Produto não encontrado", 404);

    const [movements, receiptItems, saleLines, refundLines] = await Promise.all([
      prisma.stockMovement.count({ where: { productId: id, barbershopId } }),
      prisma.inventoryReceiptItem.count({ where: { productId: id } }),
      prisma.retailSaleLine.count({ where: { productId: id } }),
      prisma.retailSaleRefundLine.count({ where: { productId: id } }),
    ]);
    if (movements + receiptItems + saleLines + refundLines > 0) {
      throw new AppError(
        "Este produto já tem histórico de estoque ou vendas. Use Inativar para mantê-lo fora das listas.",
        409,
        undefined,
        "PRODUCT_HAS_HISTORY",
      );
    }

    const openReservations = await prisma.productReservation.count({
      where: { productId: id, barbershopId, status: "RESERVED", expiresAt: { gt: new Date() } },
    });
    if (openReservations > 0) {
      throw new AppError(
        "Este produto tem reservas em aberto. Aguarde a retirada ou peça o cancelamento antes de apagar.",
        409,
        undefined,
        "PRODUCT_HAS_OPEN_RESERVATIONS",
      );
    }

    await prisma.product.deleteMany({ where: { id, barbershopId } });
    return { deleted: true };
  }

  async uploadImage(
    id: string,
    barbershopId: string,
    user: ProductActor,
    data: { buffer: Buffer; mimeType: string; originalName?: string },
  ) {
    const log = getModuleLogger("products:upload");
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const product = await prisma.product.findFirst({ where: { id, barbershopId } });
    if (!product) throw new AppError("Produto não encontrado", 404);

    const ext = data.mimeType === "image/jpg" ? "jpg" : data.mimeType.split("/")[1] ?? "jpg";
    const fileName = `product-${id}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    log.info({ productId: id, barbershopId, fileName, mimeType: data.mimeType, size: data.buffer.byteLength }, "Iniciando upload de imagem do produto");

    try {
      const result = await this.storage.uploadBuffer("products", fileName, data.buffer, data.mimeType);
      log.info({ productId: id, publicUrl: result.publicUrl, objectName: result.objectName }, "Upload de imagem do produto concluído");
      await prisma.product.update({ where: { id }, data: { imageUrl: result.publicUrl } });
      return { imageUrl: result.publicUrl };
    } catch (err) {
      log.error({ err, productId: id, barbershopId, fileName }, "Falha no upload de imagem do produto");
      throw err;
    }
  }

  async listCategories(barbershopId: string, user: ProductActor) {
    await assertProductPermission(user, barbershopId, ["PRODUCTS_VIEW", "PRODUCTS_MANAGE", "RETAIL_SELL", "INVENTORY_MANAGE"]);
    const cats = await prisma.productCategory.findMany({ where: { barbershopId }, orderBy: { name: "asc" } });
    if (cats.length === 0) {
      const defaults = [
        { name: "Cabelo", color: "#8B5CF6", icon: "scissors" },
        { name: "Barba", color: "#F59E0B", icon: "scissors" },
        { name: "Skincare", color: "#10B981", icon: "sparkles" },
        { name: "Unha", color: "#EC4899", icon: "sparkles" },
        { name: "Revenda", color: "#3B82F6", icon: "package" },
        { name: "Outros", color: "#6B7280", icon: "package" },
      ];
      await prisma.productCategory.createMany({
        data: defaults.map(d => ({ barbershopId, ...d })),
      });
      return prisma.productCategory.findMany({ where: { barbershopId }, orderBy: { name: "asc" } });
    }
    return cats;
  }

  async createCategory(barbershopId: string, user: ProductActor, data: { name: string; color?: string; icon?: string }) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const titleCaseExceptions = new Set(["de", "do", "da", "dos", "das", "e", "para", "com", "sem", "ou"]);
    const formattedName = data.name.trim().replace(/\s+/g, " ").split(" ").map((w, i) =>
      i === 0 || !titleCaseExceptions.has(w.toLowerCase()) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()
    ).join(" ");
    return prisma.productCategory.create({ data: { barbershopId, name: formattedName, color: data.color, icon: data.icon } });
  }

  async updateCategory(id: string, barbershopId: string, user: ProductActor, data: Prisma.ProductCategoryUncheckedUpdateInput) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const row = await prisma.productCategory.findFirst({ where: { id, barbershopId } });
    if (!row) throw new AppError("Categoria não encontrada", 404);
    return prisma.productCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string, barbershopId: string, user: ProductActor) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const row = await prisma.productCategory.findFirst({ where: { id, barbershopId } });
    if (!row) throw new AppError("Categoria não encontrada", 404);
    const productCount = await prisma.product.count({ where: { categoryId: id, barbershopId } });
    if (productCount > 0) {
      await prisma.product.updateMany({ where: { categoryId: id, barbershopId }, data: { categoryId: null } });
    }
    await prisma.productCategory.delete({ where: { id } });
    return { deleted: true, movedProducts: productCount };
  }

  async listSuppliers(barbershopId: string, user: ProductActor) {
    const perms = await assertProductPermission(user, barbershopId, ["INVENTORY_MANAGE", "PRODUCTS_MANAGE"]);
    if (!canSeeProductCosts(user, perms) && user.role === "EMPLOYEE" && !perms.includes("INVENTORY_MANAGE")) {
      throw new AppError("Você não possui permissão para esta ação de produtos", 403);
    }
    return prisma.supplier.findMany({ where: { barbershopId }, orderBy: { name: "asc" } });
  }

  async createSupplier(barbershopId: string, user: ProductActor, data: Prisma.SupplierUncheckedCreateInput) {
    await assertProductPermission(user, barbershopId, "INVENTORY_MANAGE");
    return prisma.supplier.create({ data: { ...data, barbershopId } });
  }

  async updateSupplier(id: string, barbershopId: string, user: ProductActor, data: Prisma.SupplierUncheckedUpdateInput) {
    await assertProductPermission(user, barbershopId, "INVENTORY_MANAGE");
    const row = await prisma.supplier.findFirst({ where: { id, barbershopId } });
    if (!row) throw new AppError("Fornecedor não encontrado", 404);
    return prisma.supplier.update({ where: { id }, data });
  }

  async listMovements(barbershopId: string, user: ProductActor, page = 1, limit = 50) {
    await assertProductPermission(user, barbershopId, "INVENTORY_MANAGE");
    const where = { barbershopId };
    const [data, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);
    return { data, total };
  }

  async listReceipts(barbershopId: string, user: ProductActor, page = 1, limit = 30) {
    await assertProductPermission(user, barbershopId, "INVENTORY_MANAGE");
    const where = { barbershopId };
    const [data, total] = await Promise.all([
      prisma.inventoryReceipt.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true } } } },
        },
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventoryReceipt.count({ where }),
    ]);
    return { data, total };
  }

  async createReceipt(barbershopId: string, user: ProductActor, body: Parameters<InventoryEngine["createReceipt"]>[0]) {
    await assertProductPermission(user, barbershopId, "INVENTORY_MANAGE");
    return this.engine.createReceipt({ ...body, barbershopId, createdById: user.id });
  }

  async reverseReceipt(barbershopId: string, user: ProductActor, receiptId: string, reason: string) {
    await assertProductPermission(user, barbershopId, "INVENTORY_MANAGE");
    return this.engine.reverseReceipt({ barbershopId, receiptId, createdById: user.id, reason });
  }

  async adjustStock(barbershopId: string, user: ProductActor, body: { productId: string; quantity: number; reason: string; type?: "MANUAL_ADJUSTMENT" | "INTERNAL_CONSUMPTION" }) {
    await assertProductPermission(user, barbershopId, "INVENTORY_MANAGE");
    return this.engine.adjustStock({ ...body, barbershopId, createdById: user.id });
  }

  async createSale(barbershopId: string, user: ProductActor, body: {
    paymentMethod: string;
    items: Array<{ productId: string; quantity: number; unitPrice?: number }>;
    discount?: number;
    clientId?: string | null;
    queueItemId?: string | null;
    appointmentId?: string | null;
    idempotencyKey?: string;
    customerName?: string;
    whatsapp?: string;
  }) {
    await assertProductsInventoryCapability(barbershopId, user.role);
    const perms = await assertProductPermission(user, barbershopId, "RETAIL_SELL");
    return this.engine.createRetailSale({
      barbershopId,
      soldById: user.id,
      clientId: body.clientId,
      queueItemId: body.queueItemId,
      appointmentId: body.appointmentId,
      paymentMethod: body.paymentMethod,
      items: body.items,
      discount: body.discount,
      idempotencyKey: body.idempotencyKey || `walkin:${crypto.randomUUID()}`,
      allowPriceOverride: canOverrideProductPrice(user, perms),
      allowDiscount: canGiveDiscount(user, perms),
      customerName: body.customerName,
      whatsapp: body.whatsapp,
    });
  }

  async getSale(barbershopId: string, user: ProductActor, id: string) {
    const perms = await assertProductPermission(user, barbershopId, ["RETAIL_SELL", "RETAIL_REFUND", "PRODUCT_REPORTS_VIEW", "INVENTORY_MANAGE"]);
    const sale = await prisma.retailSale.findFirst({
      where: { id, barbershopId },
      include: { lines: true, refunds: { include: { lines: true } }, fiado: true },
    });
    if (!sale) throw new AppError("Venda não encontrada", 404);
    if (!canSeeProductCosts(user, perms)) {
      return { ...sale, totalCost: undefined, lines: sale.lines.map((line: { unitCost?: number }) => ({ ...line, unitCost: undefined })) };
    }
    return sale;
  }

  async listSales(barbershopId: string, user: ProductActor, page = 1, limit = 30) {
    const perms = await assertProductPermission(user, barbershopId, ["RETAIL_SELL", "PRODUCT_REPORTS_VIEW", "INVENTORY_MANAGE"]);
    const where = { barbershopId };
    const [rows, total] = await Promise.all([
      prisma.retailSale.findMany({
        where,
        include: { lines: true },
        orderBy: { soldAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.retailSale.count({ where }),
    ]);
    const showCost = canSeeProductCosts(user, perms);
    return {
      data: rows.map((sale: { totalCost?: number; lines: Array<{ unitCost?: number }> }) => showCost ? sale : { ...sale, totalCost: undefined, lines: sale.lines.map((line: { unitCost?: number }) => ({ ...line, unitCost: undefined })) }),
      total,
    };
  }

  async refundSale(barbershopId: string, user: ProductActor, saleId: string, body: {
    reason: string; restock: boolean; refundMethod: string; items: Array<{ productId: string; quantity: number }>;
  }) {
    await assertProductPermission(user, barbershopId, "RETAIL_REFUND");
    return this.engine.refundRetailSale({ ...body, barbershopId, saleId, createdById: user.id });
  }

  async reports(barbershopId: string, user: ProductActor, from?: Date, to?: Date) {
    await assertProductPermission(user, barbershopId, "PRODUCT_REPORTS_VIEW");
    const soldAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const dateFilter = from || to ? soldAt : undefined;
    const byProductMap = await summarizeRetailLines(barbershopId, dateFilter);
    const products = await prisma.product.findMany({
      where: { barbershopId, trackStock: true, active: true },
      select: {
        id: true,
        name: true,
        stockQty: true,
        minStock: true,
        trackStock: true,
        type: true,
        averageCost: true,
      },
    });
    const byProduct = [...byProductMap.values()].map((row) => ({ ...row, margin: row.revenue - row.cost }));
    const attention = buildProductAttention({ products, byProduct, from, to });
    const lowStock = products.filter((p: { minStock: number; stockQty: number }) => p.minStock > 0 && p.stockQty <= p.minStock);
    const inventoryValue = products.reduce((sum: number, p: { stockQty: number; averageCost: number }) => sum + p.stockQty * p.averageCost, 0);
    const byStaffRaw = await prisma.retailSale.groupBy({
      by: ["soldById"],
      where: { barbershopId, status: { in: ["COMPLETED", "REFUNDED"] }, ...(dateFilter ? { soldAt: dateFilter } : {}) },
      _sum: { total: true },
      _count: { id: true },
    });
    const staffIds = byStaffRaw.map((row: { soldById: string }) => row.soldById);
    const staffRows = staffIds.length
      ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
      : [];
    const staffNames = new Map(staffRows.map((row: { id: string; name: string }) => [row.id, row.name]));
    return {
      byProduct,
      lowStock,
      idleProducts: attention.idle.map((p) => ({ id: p.productId, name: p.name, stockQty: p.stockQty })),
      attention,
      inventoryValue,
      byStaff: byStaffRaw.map((row: { soldById: string; _sum: { total: number | null }; _count: { id: number } }) => ({
        soldById: row.soldById,
        soldByName: staffNames.get(row.soldById) ?? "Equipe",
        total: row._sum.total ?? 0,
        count: row._count.id,
      })),
    };
  }

  async previewTemplate(barbershopId: string, user: ProductActor, segment?: BusinessSegment) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const shop = await prisma.barbershop.findUnique({ where: { id: barbershopId }, select: { businessSegment: true } });
    if (!shop) throw new AppError("Salão não encontrado", 404);
    const resolved = segment ?? shop.businessSegment;
    const template = getCatalogTemplate(resolved);
    const installed = await prisma.catalogTemplateInstall.findUnique({
      where: { barbershopId_segment_version: { barbershopId, segment: resolved, version: CATALOG_TEMPLATE_VERSION } },
    });
    const [serviceCats, productCats, expenseCats, services, products] = await Promise.all([
      prisma.serviceCategory.findMany({ where: { OR: [{ barbershopId }, { barbershopId: null }] }, select: { name: true } }),
      prisma.productCategory.findMany({ where: { barbershopId }, select: { name: true } }),
      prisma.expenseCategory.findMany({ where: { OR: [{ barbershopId }, { barbershopId: null }] }, select: { name: true } }),
      prisma.service.findMany({ where: { barbershopId }, select: { name: true } }),
      prisma.product.findMany({ where: { barbershopId }, select: { name: true } }),
    ]);
    const skip = (existing: { name: string }[], suggested: { name: string }[]) =>
      suggested.map((row) => ({ ...row, alreadyExists: namesToSkip(existing, suggested).has(row.name.trim().toLowerCase()) }));
    return {
      segment: resolved,
      version: template.version,
      alreadyInstalled: Boolean(installed),
      serviceCategories: skip(serviceCats, template.serviceCategories),
      productCategories: skip(productCats, template.productCategories),
      expenseCategories: skip(expenseCats, template.expenseCategories),
      services: skip(services, template.services),
      products: skip(products, template.products),
      posts: template.posts,
    };
  }

  async installTemplate(barbershopId: string, user: ProductActor, opts?: { segment?: BusinessSegment; include?: Record<string, boolean> }) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const shop = await prisma.barbershop.findUnique({ where: { id: barbershopId } });
    if (!shop) throw new AppError("Salão não encontrado", 404);
    const segment = opts?.segment ?? shop.businessSegment;
    const template = getCatalogTemplate(segment);
    const existingInstall = await prisma.catalogTemplateInstall.findUnique({
      where: { barbershopId_segment_version: { barbershopId, segment, version: template.version } },
    });
    if (existingInstall) {
      return { alreadyInstalled: true, created: { serviceCategories: 0, productCategories: 0, expenseCategories: 0, services: 0, products: 0 } };
    }
    const include = {
      serviceCategories: opts?.include?.serviceCategories !== false,
      productCategories: opts?.include?.productCategories !== false,
      expenseCategories: opts?.include?.expenseCategories !== false,
      services: opts?.include?.services !== false,
      products: opts?.include?.products !== false,
    };

    return prisma.$transaction(async (tx: AppTx) => {
      const created = { serviceCategories: 0, productCategories: 0, expenseCategories: 0, services: 0, products: 0 };
      const [serviceCats, productCats, expenseCats, services, products] = await Promise.all([
        tx.serviceCategory.findMany({ where: { OR: [{ barbershopId }, { barbershopId: null }] }, select: { name: true } }),
        tx.productCategory.findMany({ where: { barbershopId }, select: { name: true } }),
        tx.expenseCategory.findMany({ where: { OR: [{ barbershopId }, { barbershopId: null }] }, select: { name: true } }),
        tx.service.findMany({ where: { barbershopId }, select: { name: true } }),
        tx.product.findMany({ where: { barbershopId }, select: { name: true } }),
      ]);
      const skipSet = (existing: { name: string }[]) => new Set(existing.map((row) => row.name.trim().toLowerCase()));

      if (include.serviceCategories) {
        for (const row of template.serviceCategories) {
          if (skipSet(serviceCats).has(row.name.toLowerCase())) continue;
          await tx.serviceCategory.create({ data: { barbershopId, name: row.name, icon: row.icon, color: row.color } });
          created.serviceCategories += 1;
        }
      }
      if (include.productCategories) {
        for (const row of template.productCategories) {
          if (skipSet(productCats).has(row.name.toLowerCase())) continue;
          await tx.productCategory.create({ data: { barbershopId, name: row.name, icon: row.icon, color: row.color } });
          created.productCategories += 1;
        }
      }
      if (include.expenseCategories) {
        for (const row of template.expenseCategories) {
          if (skipSet(expenseCats).has(row.name.toLowerCase())) continue;
          await tx.expenseCategory.create({ data: { barbershopId, name: row.name } });
          created.expenseCategories += 1;
        }
      }

      const latestServiceCats = await tx.serviceCategory.findMany({ where: { OR: [{ barbershopId }, { barbershopId: null }] } });
      const latestProductCats = await tx.productCategory.findMany({ where: { barbershopId } });

      if (include.services) {
        for (const row of template.services) {
          if (skipSet(services).has(row.name.toLowerCase())) continue;
          const category = latestServiceCats.find((cat: { name: string; id: string }) => cat.name.toLowerCase() === (row.categoryName ?? "").toLowerCase());
          await tx.service.create({
            data: { barbershopId, name: row.name, price: row.price, avgTimeMinutes: row.avgTimeMinutes, icon: row.icon, categoryId: category?.id },
          });
          created.services += 1;
        }
      }
      if (include.products) {
        for (const row of template.products) {
          if (skipSet(products).has(row.name.toLowerCase())) continue;
          const category = latestProductCats.find((cat: { name: string; id: string }) => cat.name.toLowerCase() === row.categoryName.toLowerCase());
          const unitFields = resolveUnitFields({ unitLabel: row.unitLabel });
          await tx.product.create({
            data: {
              barbershopId,
              name: row.name,
              description: row.description,
              categoryId: category?.id,
              salePrice: row.salePrice,
              ...(unitFields ?? {}),
              unitLabel: row.unitLabel,
              type: row.type,
              stockQty: 0,
              averageCost: 0,
              trackStock: true,
            },
          });
          created.products += 1;
        }
      }

      await tx.catalogTemplateInstall.create({ data: { barbershopId, segment, version: template.version } });
      return { alreadyInstalled: false, created };
    });
  }

  async stockAlerts(barbershopId: string, user: ProductActor, days?: number) {
    await assertProductPermission(user, barbershopId, ["PRODUCTS_VIEW", "PRODUCTS_MANAGE", "RETAIL_SELL", "INVENTORY_MANAGE"]);
    const shop = await prisma.barbershop.findUnique({ where: { id: barbershopId }, select: { timezone: true } });
    const shopTz = shop?.timezone ?? "America/Sao_Paulo";
    const todayISO = getShopToday(shopTz);
    const effectiveDays = days ?? EXPIRING_SOON_DAYS;

    const baseWhere: Prisma.ProductWhereInput = {
      barbershopId,
      active: true,
      trackStock: true,
      stockQty: { gt: 0 },
      type: { in: ["CONSUMABLE", "BOTH"] as ProductTypeEnum[] },
      expirationDate: { not: null },
    };

    const [expiredRows, expiringRows] = await Promise.all([
      prisma.product.findMany({
        where: { ...baseWhere, expirationDate: { lt: new Date(todayISO) } },
        select: {
          id: true, name: true, stockQty: true, unit: true, unitLabel: true,
          expirationDate: true, lotNumber: true,
        },
        orderBy: { expirationDate: "asc" },
        take: 50,
      }),
      prisma.product.findMany({
        where: {
          ...baseWhere,
          expirationDate: { gte: new Date(todayISO), lte: new Date(Date.UTC(
            ...todayISO.split("-").map(Number) as [number, number, number],
            effectiveDays,
          )) },
        },
        select: {
          id: true, name: true, stockQty: true, unit: true, unitLabel: true,
          expirationDate: true, lotNumber: true,
        },
        orderBy: { expirationDate: "asc" },
        take: 50,
      }),
    ]);

    const enrich = (rows: typeof expiredRows) =>
      rows.map((r: { id: string; name: string; stockQty: number; unit: string; unitLabel: string; expirationDate: Date | null; lotNumber: string | null }) => {
        const expStr = r.expirationDate!.toISOString().slice(0, 10);
        const diffMs = new Date(expStr).getTime() - new Date(todayISO).getTime();
        return {
          id: r.id,
          name: r.name,
          stockQty: r.stockQty,
          unit: r.unit,
          unitLabel: r.unitLabel,
          expirationDate: expStr,
          lotNumber: r.lotNumber,
          daysToExpire: Math.round(diffMs / 86_400_000),
        };
      });

    return {
      days: effectiveDays,
      expired: { count: expiredRows.length, items: enrich(expiredRows) },
      expiringSoon: { count: expiringRows.length, items: enrich(expiringRows) },
    };
  }
}
