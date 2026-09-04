import { prisma } from "@/libs/prismaClient";

export type RetailDateFilter = { gte?: Date; lte?: Date } | undefined;

export type RetailLineSummary = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
};

export async function summarizeRetailLines(
  barbershopId: string,
  dateFilter?: RetailDateFilter
): Promise<Map<string, { productId: string; name: string; quantity: number; revenue: number; cost: number }>> {
  const soldAt = dateFilter;
  const sales = await prisma.retailSale.findMany({
    where: {
      barbershopId,
      status: { in: ["COMPLETED", "REFUNDED"] },
      ...(soldAt ? { soldAt } : {}),
    },
    include: { lines: true },
  });
  const byProduct = new Map<string, { productId: string; name: string; quantity: number; revenue: number; cost: number }>();
  for (const sale of sales) {
    for (const line of sale.lines) {
      const qty = line.quantity - line.refundedQty;
      if (qty <= 0) continue;
      const current = byProduct.get(line.productId) ?? {
        productId: line.productId,
        name: line.productName,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };
      current.quantity += qty;
      current.revenue += line.unitPrice * qty;
      current.cost += line.unitCost * qty;
      byProduct.set(line.productId, current);
    }
  }
  return byProduct;
}

export async function summarizeRetailFinancials(
  barbershopId: string,
  dateFilter?: RetailDateFilter
): Promise<{
  revenue: number;
  refunded: number;
  netRevenue: number;
  cogs: number;
  margin: number;
  saleCount: number;
}> {
  const soldAt = dateFilter;
  const [productSales, productRefunds, byProduct] = await Promise.all([
    prisma.retailSale.aggregate({
      where: {
        barbershopId,
        status: { in: ["COMPLETED", "REFUNDED"] },
        ...(soldAt ? { soldAt } : {}),
      },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.retailSaleRefund.aggregate({
      where: {
        barbershopId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      _sum: { financialRefund: true },
    }),
    summarizeRetailLines(barbershopId, soldAt),
  ]);

  const revenue = productSales._sum.total ?? 0;
  const refunded = productRefunds._sum.financialRefund ?? 0;
  const netRevenue = Math.max(0, revenue - refunded);
  let cogs = 0;
  for (const row of byProduct.values()) {
    cogs += row.cost;
  }
  return {
    revenue,
    refunded,
    netRevenue,
    cogs,
    margin: netRevenue - cogs,
    saleCount: productSales._count.id,
  };
}
