import { inject, injectable } from "tsyringe";
import { prisma, Prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { InventoryEngine } from "../infra/InventoryEngine";
import {
  assertProductPermission,
  canOverrideProductPrice,
  canSeeProductCosts,
  ProductActor,
} from "../permissions";
import { CATALOG_TEMPLATE_VERSION, getCatalogTemplate } from "../catalogTemplates";
import type { BusinessSegment } from "@/modules/barbershops/dtos/IBarbershopResponseDTO";
import { namesToSkip } from "../inventoryMath";
import { assertProductsInventoryCapability } from "@/shared/constants/productsInventory";
import {
  assertUniqueProductCode,
  isProductUniqueViolation,
  normalizeCode,
  throwProductUniqueViolation,
} from "../utils/productCodeUtils";
import { summarizeRetailLines } from "../utils/retailSummary";

function stripCost<T extends { averageCost?: number }>(row: T, showCost: boolean) {
  if (showCost) return row;
  const { averageCost: _cost, ...rest } = row as T & { averageCost?: number };
  void _cost;
  return rest;
}

@injectable()
export class ProductCatalogUseCase {
  constructor(@inject(InventoryEngine) private engine: InventoryEngine) {}

  async listProducts(barbershopId: string, user: ProductActor, query: {
    search?: string; categoryId?: string; active?: string; type?: string; lowStock?: string; forSale?: string; page: number; limit: number;
  }) {
    const perms = await assertProductPermission(user, barbershopId, ["PRODUCTS_VIEW", "PRODUCTS_MANAGE", "RETAIL_SELL", "INVENTORY_MANAGE"]);
    const showCost = canSeeProductCosts(user, perms);
    const where: Prisma.ProductWhereInput = { barbershopId };
    if (query.active) where.active = query.active === "true";
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.type) where.type = query.type as never;
    if (query.forSale === "true") where.type = { in: ["RETAIL", "BOTH"] };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { sku: { contains: query.search, mode: "insensitive" } },
        { barcode: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.lowStock === "true") {
      const skip = (query.page - 1) * query.limit;
      const [idRows, countRows] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>`
          SELECT id::text AS id FROM products
          WHERE "barbershopId" = ${barbershopId}::uuid
            AND "trackStock" = true
            AND "minStock" > 0
            AND "stockQty" <= "minStock"
          ORDER BY name ASC
          LIMIT ${query.limit} OFFSET ${skip}
        `,
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::bigint AS count FROM products
          WHERE "barbershopId" = ${barbershopId}::uuid
            AND "trackStock" = true
            AND "minStock" > 0
            AND "stockQty" <= "minStock"
        `,
      ]);
      const ids = idRows.map((row) => row.id);
      const rows = ids.length
        ? await prisma.product.findMany({
            where: { id: { in: ids } },
            include: { category: true },
          })
        : [];
      const order = new Map(ids.map((id, index) => [id, index]));
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const total = Number(countRows[0]?.count ?? 0);
      return {
        data: rows.map((row) => stripCost(row, showCost)),
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
    const data = rows.map((row: { averageCost?: number }) => stripCost(row, showCost));
    return { data, total };
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
    try {
      return await prisma.product.create({
        data: { ...data, barbershopId, sku, barcode, stockQty: 0, averageCost: 0 },
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
    try {
      return await prisma.product.update({
        where: { id },
        data: {
          ...data,
          ...(sku !== undefined ? { sku } : {}),
          ...(barcode !== undefined ? { barcode } : {}),
        },
      });
    } catch (error) {
      if (isProductUniqueViolation(error)) throwProductUniqueViolation();
      throw error;
    }
  }

  async listCategories(barbershopId: string, user: ProductActor) {
    await assertProductPermission(user, barbershopId, ["PRODUCTS_VIEW", "PRODUCTS_MANAGE", "RETAIL_SELL", "INVENTORY_MANAGE"]);
    return prisma.productCategory.findMany({ where: { barbershopId }, orderBy: { name: "asc" } });
  }

  async createCategory(barbershopId: string, user: ProductActor, data: { name: string; color?: string; icon?: string }) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    return prisma.productCategory.create({ data: { barbershopId, name: data.name, color: data.color, icon: data.icon } });
  }

  async updateCategory(id: string, barbershopId: string, user: ProductActor, data: Prisma.ProductCategoryUncheckedUpdateInput) {
    await assertProductPermission(user, barbershopId, "PRODUCTS_MANAGE");
    const row = await prisma.productCategory.findFirst({ where: { id, barbershopId } });
    if (!row) throw new AppError("Categoria não encontrada", 404);
    return prisma.productCategory.update({ where: { id }, data });
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
    const products = await prisma.product.findMany({ where: { barbershopId, trackStock: true, active: true } });
    const lowStock = products.filter((p: { minStock: number; stockQty: number }) => p.minStock > 0 && p.stockQty <= p.minStock);
    const idle = products.filter((p: { id: string; stockQty: number }) => !byProductMap.has(p.id) && p.stockQty > 0);
    const inventoryValue = products.reduce((sum: number, p: { stockQty: number; averageCost: number }) => sum + p.stockQty * p.averageCost, 0);
    const byStaffRaw = await prisma.retailSale.groupBy({
      by: ["soldById"],
      where: { barbershopId, status: { in: ["COMPLETED", "REFUNDED"] }, ...(dateFilter ? { soldAt: dateFilter } : {}) },
      _sum: { total: true },
      _count: { id: true },
    });
    const staffIds = byStaffRaw.map((row) => row.soldById);
    const staffRows = staffIds.length
      ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
      : [];
    const staffNames = new Map(staffRows.map((row) => [row.id, row.name]));
    return {
      byProduct: [...byProductMap.values()].map((row) => ({ ...row, margin: row.revenue - row.cost })),
      lowStock,
      idleProducts: idle.map((p: { id: string; name: string; stockQty: number }) => ({ id: p.id, name: p.name, stockQty: p.stockQty })),
      inventoryValue,
      byStaff: byStaffRaw.map((row) => ({
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

    return prisma.$transaction(async (tx) => {
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
          await tx.product.create({
            data: {
              barbershopId,
              name: row.name,
              description: row.description,
              categoryId: category?.id,
              salePrice: row.salePrice,
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
}
