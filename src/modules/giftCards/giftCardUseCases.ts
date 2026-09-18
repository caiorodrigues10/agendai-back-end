import { GiftCardRepository } from "./giftCardRepository";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import type { z } from "zod";
import type { purchaseGiftCardSchema, redeemGiftCardSchema, giftCardListQuerySchema } from "./giftCardSchema";

type PurchaseInput = z.infer<typeof purchaseGiftCardSchema>;
type RedeemInput = z.infer<typeof redeemGiftCardSchema>;
type ListQuery = z.infer<typeof giftCardListQuerySchema>;

export class GiftCardUseCases {
  private repo = new GiftCardRepository();

  async purchase(barbershopId: string, data: PurchaseInput) {
    const code = await this.repo.generateUniqueCode();
    return this.repo.create({ ...data, barbershopId }, code);
  }

  async getById(id: string, barbershopId: string) {
    const card = await this.repo.findById(id);
    if (!card) throw new AppError("Gift card não encontrado", 404);
    if (card.barbershopId !== barbershopId) throw new AppError("Gift card não pertence a esta barbearia", 403);
    return card;
  }

  async lookupByCode(code: string, barbershopId: string) {
    const card = await this.repo.findByCode(code);
    if (!card) throw new AppError("Gift card não encontrado", 404);
    if (card.barbershopId !== barbershopId) throw new AppError("Gift card não pertence a esta barbearia", 403);
    return card;
  }

  async list(barbershopId: string, query: ListQuery) {
    return this.repo.listByBarbershop(barbershopId, query.status);
  }

  async redeem(id: string, barbershopId: string, data: RedeemInput) {
    return prisma.$transaction(async (tx: typeof prisma) => {
      const card = await tx.giftCard.findUnique({
        where: { id },
        select: {
          id: true,
          barbershopId: true,
          currentBalance: true,
          status: true,
          expiresAt: true,
        },
      });

      if (!card) throw new AppError("Gift card não encontrado", 404);
      if (card.barbershopId !== barbershopId) {
        throw new AppError("Gift card não pertence a esta barbearia", 403);
      }
      if (card.status === "CANCELED") {
        throw new AppError("Gift card está cancelado", 400);
      }
      if (card.status === "EXPIRED") {
        throw new AppError("Gift card expirado", 400);
      }
      if (card.status === "EXHAUSTED") {
        throw new AppError("Gift card sem saldo", 400);
      }
      if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
        throw new AppError("Gift card expirou", 400);
      }

      const currentBalance = Number(card.currentBalance);
      if (data.amount > currentBalance) {
        throw new AppError("Valor excede o saldo disponível", 400);
      }

      const newBalance = currentBalance - data.amount;
      const newStatus = newBalance === 0 ? "EXHAUSTED" : "PARTIALLY_USED";

      await tx.giftCardUsage.create({
        data: {
          giftCardId: id,
          amount: data.amount,
          appointmentId: data.appointmentId ?? null,
          notes: data.notes ?? null,
        },
      });

      const updated = await tx.giftCard.update({
        where: { id },
        data: {
          currentBalance: newBalance,
          status: newStatus,
          ...(newStatus === "EXHAUSTED" ? { redeemedAt: new Date() } : {}),
        },
      });

      return updated;
    });
  }

  async cancel(id: string, barbershopId: string) {
    const card = await this.repo.findById(id);
    if (!card) throw new AppError("Gift card não encontrado", 404);
    if (card.barbershopId !== barbershopId) {
      throw new AppError("Gift card não pertence a esta barbearia", 403);
    }
    if (card.status === "EXHAUSTED") {
      throw new AppError("Não é possível cancelar gift card totalmente utilizado", 400);
    }
    return this.repo.cancel(id);
  }

  async getUsages(id: string, barbershopId: string) {
    const card = await this.repo.findById(id);
    if (!card) throw new AppError("Gift card não encontrado", 404);
    if (card.barbershopId !== barbershopId) throw new AppError("Gift card não pertence a esta barbearia", 403);
    return this.repo.getUsages(id);
  }

  async expireExpired() {
    return this.repo.expireExpired();
  }
}
