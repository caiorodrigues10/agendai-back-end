import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { requestContext } from "@/shared/infra/http/requestContext";
import { computeAvailableQuantity } from "./reservationRules";
import { ProductType } from "@prisma/client";
import type { Prisma, ProductReservationStatus } from "@prisma/client";

export type PublicShop = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  whatsapp: string;
  timezone: string;
};

/**
 * Linha de produto para a vitrine pública.
 * Seleção propositalmente explícita: custo, SKU, código de barras e lote
 * NUNCA saem do banco por aqui (só o dono vê via /products autenticado).
 */
export type PublicProductRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  salePrice: number;
  unitLabel: string;
  categoryId: string | null;
  categoryName: string | null;
  stockQty: number;
  trackStock: boolean;
};

type PublicProductSelectedRow = Omit<PublicProductRow, "categoryName"> & {
  category: { name: string } | null;
};

export type ProductReservationRow = {
  id: string;
  barbershopId: string;
  productId: string;
  customerName: string;
  whatsapp: string;
  quantity: number;
  unitPrice: number;
  status: ProductReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  productName?: string | null;
};

export type CreateReservedInput = {
  barbershopId: string;
  productId: string;
  customerName: string;
  whatsapp: string;
  quantity: number;
  unitPrice: number;
  expiresAt: Date;
  now: Date;
};

export interface IProductReservationRepository {
  findShopForPublic(barbershopId: string): Promise<PublicShop | null>;
  listPublicProducts(barbershopId: string, shopTodayISO: string): Promise<PublicProductRow[]>;
  findPublicProduct(barbershopId: string, productId: string, shopTodayISO: string): Promise<PublicProductRow | null>;
  sumReservedQuantity(barbershopId: string, productIds: string[], now: Date): Promise<Record<string, number>>;
  countOpenReservationsByWhatsapp(barbershopId: string, whatsapp: string, now: Date): Promise<number>;
  createReserved(input: CreateReservedInput): Promise<ProductReservationRow>;
  listReservations(
    barbershopId: string,
    filter: { status?: ProductReservationStatus; page: number; limit: number },
  ): Promise<{ data: ProductReservationRow[]; total: number }>;
  findById(id: string, barbershopId: string): Promise<ProductReservationRow | null>;
  markFinalized(id: string, barbershopId: string, status: ProductReservationStatus): Promise<boolean>;
}

export class ProductReservationRepository implements IProductReservationRepository {
  async findShopForPublic(barbershopId: string) {
    const shop = await prisma.barbershop.findFirst({
      where: { id: barbershopId, active: true },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        whatsapp: true,
        timezone: true,
      },
    });
    return (shop as PublicShop | null) ?? null;
  }

  /**
   * Filtro de vitrine: ativo, tipo RETAIL/BOTH e não vencido.
   * `expirationDate` é `@db.Date` (meia-noite UTC) e só existe em
   * CONSUMABLE/BOTH; a comparação usa a "hoje" do fuso do salão.
   */
  private publicProductWhere(barbershopId: string, shopTodayISO: string): Prisma.ProductWhereInput {
    return {
      barbershopId,
      active: true,
      type: { in: [ProductType.RETAIL, ProductType.BOTH] },
      OR: [
        { expirationDate: null },
        { expirationDate: { gte: new Date(`${shopTodayISO}T00:00:00.000Z`) } },
      ],
    };
  }

  private productSelect = {
    id: true,
    name: true,
    description: true,
    imageUrl: true,
    salePrice: true,
    unitLabel: true,
    categoryId: true,
    stockQty: true,
    trackStock: true,
    category: { select: { name: true } },
  };

  async listPublicProducts(barbershopId: string, shopTodayISO: string) {
    const rows = await prisma.product.findMany({
      where: this.publicProductWhere(barbershopId, shopTodayISO),
      select: this.productSelect,
      orderBy: { name: "asc" },
    });
    return (rows as PublicProductSelectedRow[]).map(
      ({ category, ...row }) => ({ ...row, categoryName: category?.name ?? null }),
    );
  }

  async findPublicProduct(barbershopId: string, productId: string, shopTodayISO: string) {
    const row = await prisma.product.findFirst({
      where: { ...this.publicProductWhere(barbershopId, shopTodayISO), id: productId },
      select: this.productSelect,
    });
    if (!row) return null;
    const { category, ...rest } = row as PublicProductSelectedRow;
    return { ...rest, categoryName: category?.name ?? null };
  }

  /** Soma das reservas abertas (RESERVED e não vencidas) por produto. */
  async sumReservedQuantity(barbershopId: string, productIds: string[], now: Date) {
    if (productIds.length === 0) return {} as Record<string, number>;
    const rows = await prisma.productReservation.groupBy({
      by: ["productId"],
      where: {
        barbershopId,
        productId: { in: productIds },
        status: "RESERVED",
        expiresAt: { gt: now },
      },
      _sum: { quantity: true },
    });
    const map: Record<string, number> = {};
    for (const row of rows as Array<{ productId: string; _sum: { quantity: number | null } }>) {
      map[row.productId] = Number(row._sum.quantity ?? 0);
    }
    return map;
  }

  async countOpenReservationsByWhatsapp(barbershopId: string, whatsapp: string, now: Date) {
    return Number(
      await prisma.productReservation.count({
        where: {
          barbershopId,
          whatsapp,
          status: "RESERVED",
          expiresAt: { gt: now },
        },
      }),
    );
  }

  /**
   * Cria a reserva de forma atômica.
   *
   * IMPORTANTE — por que SQL puro dentro da transação: a extensão de RLS
   * (`libs/prismaExtensions.ts`) intercepta operações de modelo e as roteia
   * para OUTRA conexão do pool, fora desta transação. Uma escrita via
   * `tx.product.update()` depois de `SELECT ... FOR UPDATE` entra em deadlock
   * e estoura com P2028 (verificado em 2026-10-01). Raw SQL fica na mesma
   * conexão, então o lock, o cálculo de disponibilidade e o INSERT são
   * realmente atômicos. O GUC de RLS é setado aqui manualmente, pelo mesmo
   * motivo (a extensão não roda nesta conexão).
   */
  async createReserved(input: CreateReservedInput) {
    return prisma.$transaction(async (tx: any) => {
      const guc = requestContext.getStore()?.barbershopId ?? "";
      await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${guc}, TRUE)`;

      // Lock da linha do produto: serializa reservas concorrentes do mesmo item.
      const locked = await tx.$queryRaw<Array<{ id: string; stockQty: number; trackStock: boolean }>>`
        SELECT id, "stockQty", "trackStock"
        FROM products
        WHERE id = ${input.productId}::uuid AND "barbershopId" = ${input.barbershopId}::uuid
        FOR UPDATE`;

      if (!locked[0]) throw new AppError("Produto não encontrado", 404);

      const product = locked[0];
      if (product.trackStock) {
        const agg = await tx.$queryRaw<Array<{ total: number }>>`
          SELECT COALESCE(SUM(quantity), 0)::float8 AS total
          FROM product_reservations
          WHERE "productId" = ${input.productId}::uuid
            AND "status" = 'RESERVED'
            AND "expiresAt" > (${input.now}::timestamptz AT TIME ZONE 'UTC')`;
        const available = computeAvailableQuantity(product.stockQty, true, Number(agg[0]?.total ?? 0));
        if (available === null || available < input.quantity) {
          throw new AppError(
            available ? `Estoque insuficiente. Disponível: ${available}` : "Produto sem estoque disponível",
            409,
            undefined,
            "INSUFFICIENT_STOCK",
          );
        }
      }

      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO product_reservations
          (id, "barbershopId", "productId", "customerName", "whatsapp", quantity,
           "unitPrice", status, "expiresAt", "createdAt", "updatedAt")
        VALUES
          (${id}::uuid, ${input.barbershopId}::uuid, ${input.productId}::uuid,
           ${input.customerName}, ${input.whatsapp}, ${input.quantity}::int,
           ${input.unitPrice}::real, 'RESERVED',
           (${input.expiresAt}::timestamptz AT TIME ZONE 'UTC'),
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`;

      const [row] = await tx.$queryRaw<
        Array<Omit<ProductReservationRow, "productName">>
      >`SELECT * FROM product_reservations WHERE id = ${id}::uuid`;
      return row as ProductReservationRow;
    });
  }

  async listReservations(
    barbershopId: string,
    filter: { status?: ProductReservationStatus; page: number; limit: number },
  ) {
    const where = {
      barbershopId,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.productReservation.findMany({
        where,
        select: {
          id: true,
          barbershopId: true,
          productId: true,
          customerName: true,
          whatsapp: true,
          quantity: true,
          unitPrice: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          product: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      prisma.productReservation.count({ where }),
    ]);
    const data = (rows as Array<Omit<ProductReservationRow, "productName"> & { product: { name: string } }>).map(
      ({ product, ...row }) => ({ ...row, productName: product.name }),
    );
    return { data, total: Number(total) };
  }

  async findById(id: string, barbershopId: string) {
    const row = await prisma.productReservation.findFirst({
      where: { id, barbershopId },
      select: {
        id: true,
        barbershopId: true,
        productId: true,
        customerName: true,
        whatsapp: true,
        quantity: true,
        unitPrice: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        product: { select: { name: true } },
      },
    });
    if (!row) return null;
    const { product, ...rest } = row as Omit<ProductReservationRow, "productName"> & {
      product: { name: string };
    };
    return { ...rest, productName: product.name };
  }

  /**
   * Atualização condicional em uma única instrução: só sai do RESERVED se
   * ainda estiver RESERVED, o que torna a transição final atômica mesmo com
   * dois donos clicando ao mesmo tempo. Retorna false quando não houve linha
   * afetada (reserva já finalizada).
   */
  async markFinalized(id: string, barbershopId: string, status: ProductReservationStatus) {
    const result = await prisma.productReservation.updateMany({
      where: { id, barbershopId, status: "RESERVED" },
      data: { status },
    });
    return Number(result?.count ?? 0) > 0;
  }
}

export { computeAvailableQuantity };
