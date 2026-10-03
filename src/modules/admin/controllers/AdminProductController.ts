import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { rlsTransaction } from "@/libs/prismaExtensions";

const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (value: number): number => Math.round(value * 100) / 100;

async function topProductRows(): Promise<
  Array<{ productId: string; name: string; units: number; revenue: number }>
> {
  return rlsTransaction(async (tx: any) =>
    tx.$queryRaw<Array<{ productId: string; name: string; units: number; revenue: number }>>`
      SELECT l."productId"::text AS "productId",
             p.name AS name,
             COALESCE(SUM(l.quantity), 0)::float AS units,
             COALESCE(SUM(l.quantity * l."unitPrice"), 0)::float AS revenue
      FROM retail_sale_lines l
      JOIN retail_sales s ON s.id = l."saleId"
      JOIN products p ON p.id = l."productId"
      WHERE s.status = 'COMPLETED'
      GROUP BY l."productId", p.name
      ORDER BY units DESC
      LIMIT 6
    `,
  );
}

async function salesLast30d(
  since: Date,
): Promise<{ units: number; revenue: number }> {
  const rows = await rlsTransaction(async (tx: any) =>
    tx.$queryRaw<Array<{ units: number; revenue: number }>>`
      SELECT COALESCE(SUM(l.quantity), 0)::float AS units,
             COALESCE(SUM(l.quantity * l."unitPrice"), 0)::float AS revenue
      FROM retail_sale_lines l
      JOIN retail_sales s ON s.id = l."saleId"
      WHERE s.status = 'COMPLETED'
        AND s."soldAt" >= ${since}::timestamp
    `,
  );

  return { units: rows[0]?.units ?? 0, revenue: rows[0]?.revenue ?? 0 };
}

export class AdminProductController {
  async adoption(_request: FastifyRequest, reply: FastifyReply) {
    const now = new Date();
    const since30d = new Date(now.getTime() - 30 * DAY_MS);

    const [
      shopsTotal,
      catalogShops,
      productsTotal,
      productsActive,
      categoriesTotal,
      trackedProducts,
      outOfStock,
      topProducts,
      sales30d,
      categoryRows,
    ] = await Promise.all([
      prisma.barbershop.count(),
      prisma.product.groupBy({ by: ["barbershopId"], where: { active: true } }),
      prisma.product.count(),
      prisma.product.count({ where: { active: true } }),
      prisma.productCategory.count(),
      prisma.product.findMany({
        where: { active: true, trackStock: true, minStock: { gt: 0 } },
        select: { stockQty: true, minStock: true },
      }),
      prisma.product.count({
        where: { active: true, trackStock: true, stockQty: { lte: 0 } },
      }),
      topProductRows(),
      salesLast30d(since30d),
      prisma.product.groupBy({
        by: ["categoryId"],
        where: { active: true },
        _count: { _all: true },
        orderBy: { _count: { categoryId: "desc" } },
        take: 6,
      }),
    ]);

    const lowStock = trackedProducts.filter(
      (product: { stockQty: number; minStock: number }) =>
        product.stockQty > 0 && product.stockQty <= product.minStock,
    ).length;

    const categoryIds = categoryRows
      .map((row: { categoryId: string | null }) => row.categoryId)
      .filter((id: string | null): id is string => Boolean(id));
    const categories =
      categoryIds.length > 0
        ? await prisma.productCategory.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true },
          })
        : [];
    const categoryNameById = new Map(
      categories.map((category: { id: string; name: string }) => [category.id, category.name]),
    );

    const adoptionPct =
      shopsTotal > 0 ? Math.round((catalogShops.length / shopsTotal) * 100) : 0;

    return reply.status(200).send({
      success: true,
      data: {
        generatedAt: now.toISOString(),
        catalog: {
          shopsTotal,
          shopsWithCatalog: catalogShops.length,
          adoptionPct,
          productsActive,
          productsInactive: productsTotal - productsActive,
          categoriesTotal,
          lowStock,
          outOfStock,
        },
        sales30d: { units: sales30d.units, revenue: round2(sales30d.revenue) },
        topProducts: topProducts.map(
          (row: { productId: string; name: string; units: number; revenue: number }) => ({
            productId: row.productId,
            name: row.name,
            units: row.units,
            revenue: round2(row.revenue),
          }),
        ),
        topCategories: categoryRows.map(
          (row: { categoryId: string | null; _count: { _all: number } }) => ({
            categoryId: row.categoryId,
            name: row.categoryId
              ? categoryNameById.get(row.categoryId) ?? "Sem categoria"
              : "Sem categoria",
            products: row._count._all,
          }),
        ),
      },
    });
  }
}
