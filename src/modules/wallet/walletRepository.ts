import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { Decimal } from "@prisma/client/runtime/library";
import type { z } from "zod";
import type { creditWalletSchema, debitWalletSchema, transferWalletSchema } from "./walletSchema";

type CreditInput = z.infer<typeof creditWalletSchema>;
type DebitInput = z.infer<typeof debitWalletSchema>;
type TransferInput = z.infer<typeof transferWalletSchema>;

const walletSelect = {
  id: true,
  identityId: true,
  balance: true,
  createdAt: true,
  updatedAt: true,
} as const;

const entrySelect = {
  id: true,
  walletId: true,
  type: true,
  amount: true,
  description: true,
  referenceId: true,
  createdAt: true,
} as const;

export class WalletRepository {
  async getWalletByIdentityId(identityId: string) {
    return prisma.digitalWallet.findUnique({
      where: { identityId },
      select: walletSelect,
    });
  }

  async getOrCreateWallet(identityId: string) {
    return prisma.digitalWallet.upsert({
      where: { identityId },
      create: { identityId },
      select: walletSelect,
    });
  }

  async getWalletById(walletId: string) {
    return prisma.digitalWallet.findUnique({
      where: { id: walletId },
      select: walletSelect,
    });
  }

  async credit(walletId: string, data: CreditInput) {
    const wallet = await prisma.digitalWallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new AppError("Carteira não encontrada", 404);

    const amount = new Decimal(data.amount);

    return prisma.$transaction(async (tx: any) => {
      const updated = await tx.digitalWallet.update({
        where: { id: walletId },
        data: { balance: { increment: amount } },
        select: walletSelect,
      });

      const entry = await tx.walletEntry.create({
        data: {
          walletId,
          type: "CREDIT",
          amount,
          description: data.description ?? null,
          referenceId: data.referenceId ?? null,
        },
        select: entrySelect,
      });

      return { wallet: updated, entry };
    });
  }

  async debit(walletId: string, data: DebitInput) {
    const wallet = await prisma.digitalWallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new AppError("Carteira não encontrada", 404);

    const amount = new Decimal(data.amount);
    if (wallet.balance.lessThan(amount)) {
      throw new AppError("Saldo insuficiente", 400);
    }

    return prisma.$transaction(async (tx: any) => {
      const updated = await tx.digitalWallet.update({
        where: { id: walletId },
        data: { balance: { decrement: amount } },
        select: walletSelect,
      });

      const entry = await tx.walletEntry.create({
        data: {
          walletId,
          type: "DEBIT",
          amount,
          description: data.description ?? null,
          referenceId: data.referenceId ?? null,
        },
        select: entrySelect,
      });

      return { wallet: updated, entry };
    });
  }

  async transfer(sourceWalletId: string, data: TransferInput) {
    const sourceWallet = await prisma.digitalWallet.findUnique({ where: { id: sourceWalletId } });
    if (!sourceWallet) throw new AppError("Carteira de origem não encontrada", 404);

    const targetWallet = await prisma.digitalWallet.findUnique({ where: { id: data.targetWalletId } });
    if (!targetWallet) throw new AppError("Carteira de destino não encontrada", 404);

    if (sourceWalletId === data.targetWalletId) {
      throw new AppError("Não é possível transferir para a mesma carteira", 400);
    }

    const amount = new Decimal(data.amount);
    if (sourceWallet.balance.lessThan(amount)) {
      throw new AppError("Saldo insuficiente", 400);
    }

    return prisma.$transaction(async (tx: any) => {
      const updatedSource = await tx.digitalWallet.update({
        where: { id: sourceWalletId },
        data: { balance: { decrement: amount } },
        select: walletSelect,
      });

      const updatedTarget = await tx.digitalWallet.update({
        where: { id: data.targetWalletId },
        data: { balance: { increment: amount } },
        select: walletSelect,
      });

      const debitEntry = await tx.walletEntry.create({
        data: {
          walletId: sourceWalletId,
          type: "TRANSFER",
          amount,
          description: data.description ?? `Transferência para carteira`,
        },
        select: entrySelect,
      });

      const creditEntry = await tx.walletEntry.create({
        data: {
          walletId: data.targetWalletId,
          type: "TRANSFER",
          amount,
          description: data.description ?? `Transferência de carteira`,
        },
        select: entrySelect,
      });

      return { source: updatedSource, target: updatedTarget, debitEntry, creditEntry };
    });
  }

  async listEntries(walletId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      prisma.walletEntry.findMany({
        where: { walletId },
        select: entrySelect,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.walletEntry.count({ where: { walletId } }),
    ]);

    return { entries, total, page, limit };
  }
}
