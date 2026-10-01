import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { getShopToday } from "@/modules/products/utils/productExpiration";
import { assertPublicShopOperationalAccess } from "@/shared/utils/assertPublicShopOperationalAccess";
import {
  IProductReservationRepository,
  ProductReservationRow,
  PublicProductRow,
  PublicShop,
} from "./productReservationRepository";
import {
  computeAvailableQuantity,
  getReservationRetentionMs,
  RESERVATION_MAX_OPEN_PER_WHATSAPP,
} from "./reservationRules";
import type { z } from "zod";
import type {
  createProductReservationSchema,
  productListReservationsQuerySchema,
  updateProductReservationStatusSchema,
} from "./productReservationSchemas";

type CreateReservationInput = z.infer<typeof createProductReservationSchema>;
type ListQuery = z.infer<typeof productListReservationsQuerySchema>;
type UpdateStatusInput = z.infer<typeof updateProductReservationStatusSchema>;

/** DTO público de produto — campos sensíveis (custo, SKU, código, lote) ficam fora. */
export type PublicProductDto = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  unitLabel: string;
  category: string | null;
  /** `null` = sem controle de estoque (trackStock false), sempre reservável. */
  available: number | null;
};

/** Endereço completo serve para a mensagem de sucesso de retirada. */
export type PublicShopDto = {
  name: string;
  address: string | null;
  city: string | null;
  whatsapp: string | null;
};

export type ReservationSummary = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  status: ProductReservationRow["status"];
  expiresAt: Date;
};

@injectable()
export class ProductReservationUseCases {
  constructor(
    @inject("ProductReservationRepository")
    private repo: IProductReservationRepository,
  ) {}

  private async publicShop(barbershopId: string): Promise<{ shop: PublicShopDto; timezone: string }> {
    await assertPublicShopOperationalAccess(barbershopId);
    const shop: PublicShop | null = await this.repo.findShopForPublic(barbershopId);
    if (!shop) throw new AppError("Estabelecimento não encontrado", 404);
    const { timezone, ...dto } = shop;
    return { shop: { ...dto, whatsapp: dto.whatsapp || null }, timezone };
  }

  private toPublicProduct(row: PublicProductRow, reservedQty: number): PublicProductDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      price: row.salePrice,
      unitLabel: row.unitLabel,
      category: row.categoryName,
      available: computeAvailableQuantity(row.stockQty, row.trackStock, reservedQty),
    };
  }

  /**
   * Vitrine pública: todo produto ativo, à venda (RETAIL/BOTH) e não vencido,
   * mesmo com `available: 0` — o front exibe o selo "Esgotado" e trava a
   * reserva. Continuam escondidos pelo repositório: inativos, tipo só
   * CONSUMABLE e vencidos.
   */
  async listPublicProducts(barbershopId: string) {
    const { shop, timezone } = await this.publicShop(barbershopId);
    const now = new Date();
    const rows = await this.repo.listPublicProducts(barbershopId, getShopToday(timezone));
    const reserved = await this.repo.sumReservedQuantity(
      barbershopId,
      rows.map((row) => row.id),
      now,
    );
    const products = rows.map((row) => this.toPublicProduct(row, reserved[row.id] ?? 0));
    return { shop, products };
  }

  async getPublicProduct(barbershopId: string, productId: string) {
    const { shop, timezone } = await this.publicShop(barbershopId);
    const now = new Date();
    const row = await this.repo.findPublicProduct(barbershopId, productId, getShopToday(timezone));
    if (!row) throw new AppError("Produto não encontrado", 404);
    const reserved = await this.repo.sumReservedQuantity(barbershopId, [row.id], now);
    // Sem filtro aqui: o detalhe pode mostrar `available: 0` para o front
    // desabilitar o botão de reservar.
    return { shop, product: this.toPublicProduct(row, reserved[row.id] ?? 0) };
  }

  async reserve(barbershopId: string, productId: string, input: CreateReservationInput) {
    const { shop, timezone } = await this.publicShop(barbershopId);
    const now = new Date();
    const row = await this.repo.findPublicProduct(barbershopId, productId, getShopToday(timezone));
    if (!row) throw new AppError("Produto não encontrado", 404);

    const reserved = await this.repo.sumReservedQuantity(barbershopId, [row.id], now);
    const available = computeAvailableQuantity(row.stockQty, row.trackStock, reserved[row.id] ?? 0);
    if (available !== null && available < input.quantity) {
      throw new AppError(
        available > 0
          ? `Estoque insuficiente. Disponível: ${available} ${row.unitLabel}`
          : "Produto sem estoque disponível",
        409,
        undefined,
        "INSUFFICIENT_STOCK",
      );
    }

    const openReservations = await this.repo.countOpenReservationsByWhatsapp(
      barbershopId,
      input.whatsapp,
      now,
    );
    if (openReservations >= RESERVATION_MAX_OPEN_PER_WHATSAPP) {
      throw new AppError(
        `Você já tem ${RESERVATION_MAX_OPEN_PER_WHATSAPP} reservas abertas neste salão. Retire ou cancele antes de reservar de novo.`,
        409,
        undefined,
        "RESERVATION_LIMIT_REACHED",
      );
    }

    const reservation = await this.repo.createReserved({
      barbershopId,
      productId,
      customerName: input.customerName,
      whatsapp: input.whatsapp,
      quantity: input.quantity,
      unitPrice: row.salePrice,
      expiresAt: new Date(now.getTime() + getReservationRetentionMs()),
      now,
    });

    const summary: ReservationSummary = {
      id: reservation.id,
      productId,
      productName: row.name,
      quantity: reservation.quantity,
      unitPrice: reservation.unitPrice,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
    };
    return { shop, reservation: summary };
  }

  /** Painel do dono: lista paginada das reservas do salão. */
  async listReservations(barbershopId: string, query: ListQuery) {
    const { data, total } = await this.repo.listReservations(barbershopId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return { data, total, page: query.page, limit: query.limit };
  }

  async updateStatus(id: string, barbershopId: string, input: UpdateStatusInput) {
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Reserva não encontrada", 404);
    if (existing.status !== "RESERVED") {
      throw new AppError("Esta reserva já foi finalizada e não pode ser alterada", 409, undefined, "RESERVATION_FINALIZED");
    }

    const updated = await this.repo.markFinalized(id, barbershopId, input.status);
    if (!updated) {
      throw new AppError("Esta reserva já foi finalizada e não pode ser alterada", 409, undefined, "RESERVATION_FINALIZED");
    }
    const reservation = await this.repo.findById(id, barbershopId);
    if (!reservation) throw new AppError("Reserva não encontrada", 404);
    return reservation;
  }
}
