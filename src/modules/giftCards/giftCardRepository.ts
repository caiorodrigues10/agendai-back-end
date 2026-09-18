import { randomInt } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  purchaseGiftCardSchema,
  redeemGiftCardSchema,
  giftCardStatusMap,
} from "./giftCardSchema";
import type { z } from "zod";

type PurchaseInput = z.infer<typeof purchaseGiftCardSchema>;
type RedeemInput = z.infer<typeof redeemGiftCardSchema>;

const giftCardSelect = {
  id: true,
  barbershopId: true,
  code: true,
  initialBalance: true,
  currentBalance: true,
  buyerName: true,
  buyerPhone: true,
  recipientName: true,
  recipientPhone: true,
  purchaserId: true,
  recipientId: true,
  status: true,
  expiresAt: true,
  purchasedAt: true,
  redeemedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const usageSelect = {
  id: true,
  giftCardId: true,
  amount: true,
  appointmentId: true,
  notes: true,
  createdAt: true,
} as const;

export class GiftCardRepository {
  async generateUniqueCode(): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(randomInt(0, chars.length));
      }
      const existing = await prisma.giftCard.findUnique({ where: { code } });
      if (!existing) return code;
    }
    throw new AppError("Falha ao gerar código único", 500);
  }

  async create(data: PurchaseInput, code: string) {
    return prisma.giftCard.create({
      data: {
        barbershopId: data.barbershopId,
        code,
        initialBalance: data.initialBalance,
        currentBalance: data.initialBalance,
        buyerName: data.buyerName ?? null,
        buyerPhone: data.buyerPhone ?? null,
        recipientName: data.recipientName ?? null,
        recipientPhone: data.recipientPhone ?? null,
        purchaserId: data.purchaserId ?? null,
        recipientId: data.recipientId ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
      select: giftCardSelect,
    });
  }

  async findById(id: string) {
    return prisma.giftCard.findUnique({
      where: { id },
      select: giftCardSelect,
    });
  }

  async findByCode(code: string) {
    return prisma.giftCard.findUnique({
      where: { code: code.toUpperCase() },
      select: giftCardSelect,
    });
  }

  async listByBarbershop(barbershopId: string, status?: string) {
    return prisma.giftCard.findMany({
      where: {
        barbershopId,
        ...(status ? { status: status.toUpperCase() as any } : {}),
      },
      select: giftCardSelect,
      orderBy: { purchasedAt: "desc" },
    });
  }

  async updateBalance(id: string, newBalance: number, status: string) {
    return prisma.giftCard.update({
      where: { id },
      data: {
        currentBalance: newBalance,
        status: status as any,
      },
      select: giftCardSelect,
    });
  }

  async markRedeemed(id: string) {
    return prisma.giftCard.update({
      where: { id },
      data: { redeemedAt: new Date() },
      select: giftCardSelect,
    });
  }

  async cancel(id: string) {
    return prisma.giftCard.update({
      where: { id },
      data: { status: "CANCELED" },
      select: giftCardSelect,
    });
  }

  async addUsage(data: { giftCardId: string; amount: number; appointmentId?: string; notes?: string }) {
    return prisma.giftCardUsage.create({
      data: {
        giftCardId: data.giftCardId,
        amount: data.amount,
        appointmentId: data.appointmentId ?? null,
        notes: data.notes ?? null,
      },
      select: usageSelect,
    });
  }

  async getUsages(giftCardId: string) {
    return prisma.giftCardUsage.findMany({
      where: { giftCardId },
      select: usageSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async expireExpired() {
    return prisma.giftCard.updateMany({
      where: {
        status: { in: ["ACTIVE", "PARTIALLY_USED"] },
        expiresAt: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });
  }
}
