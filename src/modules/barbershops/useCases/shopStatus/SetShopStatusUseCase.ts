import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getShopOpenState } from "../../utils/getShopOpenState";

/**
 * Status manual da loja e da fila.
 *
 * Extraído do controller para que outros contextos (o assistente de WhatsApp
 * do dono) usem exatamente a mesma regra — nada de Prisma solto no bot.
 */

export type OwnerShopStatusInput = {
  /** "AUTO" volta ao horário do salão; "OPEN"/"CLOSED" forçam o estado. */
  status?: "AUTO" | "OPEN" | "CLOSED";
  /** Fecha (ou reabre) a fila de hoje. */
  closed?: boolean;
};

export type ShopStatusPayload = {
  id: string;
  openingMode: string | null;
  manualStatus: string | null;
  queueClosed: boolean;
  openState: Awaited<ReturnType<typeof getShopOpenState>>;
};

export class SetShopStatusUseCase {
  async getStatus(barbershopId: string): Promise<ShopStatusPayload> {
    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        id: true,
        openingMode: true,
        manualStatus: true,
        queueClosedAt: true,
      },
    });
    if (!shop) throw new AppError("Salão não encontrado", 404);
    const openState = await getShopOpenState(barbershopId);
    return {
      id: shop.id,
      openingMode: shop.openingMode,
      manualStatus: shop.manualStatus,
      queueClosed: Boolean(shop.queueClosedAt),
      openState,
    };
  }

  async execute(
    barbershopId: string,
    input: OwnerShopStatusInput,
    requestingUser: { role?: string; barbershopId?: string | null } | undefined
  ): Promise<ShopStatusPayload> {
    if (
      requestingUser &&
      requestingUser.role !== "MASTER_ADMIN" &&
      requestingUser.barbershopId !== barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    const data: {
      manualStatus?: "AUTO" | "OPEN" | "CLOSED";
      manualStatusSetAt?: Date | null;
      queueClosedAt?: Date | null;
    } = {};

    if (input.status) {
      data.manualStatus = input.status;
      data.manualStatusSetAt = input.status === "AUTO" ? null : new Date();
    }
    if (input.closed !== undefined) {
      data.queueClosedAt = input.closed ? new Date() : null;
    }

    if (Object.keys(data).length) {
      await prisma.barbershop.update({ where: { id: barbershopId }, data });
    }

    return this.getStatus(barbershopId);
  }
}
