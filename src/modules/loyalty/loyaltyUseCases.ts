import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { LoyaltyRepository } from "./loyaltyRepository";

export class LoyaltyUseCases {
  private repo = new LoyaltyRepository();

  async configureProgram(barbershopId: string, data: { type: string; config: Record<string, unknown>; isActive?: boolean }) {
    const existing = await this.repo.findProgram(barbershopId);
    if (existing) {
      return this.repo.updateProgram(barbershopId, data.config, data.isActive ?? true);
    }
    return this.repo.createProgram(barbershopId, data.type, data.config, data.isActive ?? true);
  }

  async getProgram(barbershopId: string) {
    return this.repo.findProgram(barbershopId);
  }

  async getAccount(barbershopId: string, clientId: string) {
    const account = await this.repo.findOrCreateAccount(barbershopId, clientId);
    const entries = await this.repo.getAccountEntries(account.id);
    return { account, entries };
  }

  async getBalance(barbershopId: string, clientId: string) {
    const account = await this.repo.findOrCreateAccount(barbershopId, clientId);
    const entries = await this.repo.getAccountEntries(account.id);

    let balance = 0;
    for (const entry of entries) {
      switch (entry.type) {
        case "VISIT_EARNED":
          balance += 1;
          break;
        case "CASHBACK_EARNED":
          balance += (entry.metadata as any)?.amount ?? 0;
          break;
        case "REWARD_REDEEMED":
          balance -= 1;
          break;
        case "CASHBACK_REDEEMED":
          balance -= (entry.metadata as any)?.amount ?? 0;
          break;
        case "MANUAL_ADJUSTMENT":
          balance += (entry.metadata as any)?.delta ?? 0;
          break;
      }
    }

    return { account, balance, entries };
  }

  async recordVisit(barbershopId: string, clientId: string, idempotencyKey?: string | null) {
    return prisma.$transaction(async (tx: any) => {
      const program = await tx.loyaltyProgram.findUnique({ where: { barbershopId } });
      if (!program || !program.isActive) {
        throw new AppError("Loyalty program not configured or inactive", 400);
      }

      const account = await tx.loyaltyAccount.upsert({
        where: { barbershopId_clientId: { barbershopId, clientId } },
        create: { barbershopId, clientId, totalVisits: 1 },
        update: { totalVisits: { increment: 1 } },
      });

      let entry;
      if (idempotencyKey) {
        entry = await tx.loyaltyLedgerEntry.findUnique({ where: { idempotencyKey } });
      }
      if (!entry) {
        entry = await tx.loyaltyLedgerEntry.create({
          data: {
            barbershopId,
            accountId: account.id,
            type: "VISIT_EARNED",
            description: "Visita registrada",
            idempotencyKey: idempotencyKey ?? null,
          },
        });
      }

      const config = program.config as { visitsRequired?: number };
      const visitsRequired = config?.visitsRequired ?? 10;
      const rewardCount = Math.floor(account.totalVisits / visitsRequired);
      return { account, entry, rewardCount };
    });
  }

  async redeemReward(barbershopId: string, clientId: string, description?: string, idempotencyKey?: string | null) {
    return prisma.$transaction(async (tx: any) => {
      const program = await tx.loyaltyProgram.findUnique({ where: { barbershopId } });
      if (!program || !program.isActive) {
        throw new AppError("Loyalty program not configured or inactive", 400);
      }

      const account = await tx.loyaltyAccount.upsert({
        where: { barbershopId_clientId: { barbershopId, clientId } },
        create: { barbershopId, clientId },
        update: {},
      });
      const config = program.config as { visitsRequired?: number; rewardDescription?: string };
      const visitsRequired = config?.visitsRequired ?? 10;
      if (account.totalVisits < visitsRequired) {
        throw new AppError("Not enough visits to redeem reward", 400);
      }

      const updatedAccount = await tx.loyaltyAccount.update({
        where: { barbershopId_clientId: { barbershopId, clientId } },
        data: { rewardCount: { increment: 1 } },
      });

      let entry;
      if (idempotencyKey) {
        entry = await tx.loyaltyLedgerEntry.findUnique({ where: { idempotencyKey } });
      }
      if (!entry) {
        entry = await tx.loyaltyLedgerEntry.create({
          data: {
            barbershopId,
            accountId: account.id,
            type: "REWARD_REDEEMED",
            description: description ?? config?.rewardDescription ?? "Recompensa resgatada",
            idempotencyKey: idempotencyKey ?? null,
          },
        });
      }

      return { account: updatedAccount, entry };
    });
  }

  async adjustManual(barbershopId: string, clientId: string, delta: number, description: string, idempotencyKey?: string | null) {
    const account = await this.repo.findOrCreateAccount(barbershopId, clientId);

    const updatedAccount = await prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: { totalVisits: { increment: delta } },
    });

    const entry = await this.repo.createLedgerEntry({
      barbershopId,
      accountId: account.id,
      type: "MANUAL_ADJUSTMENT",
      description,
      metadata: { delta },
      idempotencyKey,
    });

    return { account: updatedAccount, entry };
  }

  async recordCashback(barbershopId: string, clientId: string, appointmentId: string, paymentAmount: number, idempotencyKey?: string | null) {
    const program = await this.repo.findProgram(barbershopId);
    if (!program || !program.isActive) {
      throw new AppError("Loyalty program not configured or inactive", 400);
    }

    const config = program.config as any;
    const cashbackPercent = config?.cashbackPercent ?? 0;
    if (cashbackPercent <= 0) {
      throw new AppError("Cashback not enabled for this program", 400);
    }

    const cashbackAmount = Math.round(paymentAmount * (cashbackPercent / 100) * 100) / 100;
    if (cashbackAmount <= 0) {
      throw new AppError("Cashback amount too small", 400);
    }

    const account = await this.repo.findOrCreateAccount(barbershopId, clientId);

    const entry = await this.repo.createLedgerEntry({
      barbershopId,
      accountId: account.id,
      type: "CASHBACK_EARNED",
      description: `Cashback de R$ ${cashbackAmount.toFixed(2)} sobre pagamento de R$ ${paymentAmount.toFixed(2)}`,
      metadata: { amount: cashbackAmount, paymentAmount, appointmentId },
      idempotencyKey,
    });

    return { account, entry, cashbackAmount };
  }

  async redeemCashback(barbershopId: string, clientId: string, amount: number, idempotencyKey?: string | null) {
    const program = await this.repo.findProgram(barbershopId);
    if (!program || !program.isActive) {
      throw new AppError("Loyalty program not configured or inactive", 400);
    }

    const config = program.config as any;
    if (!config?.cashbackEnabled) {
      throw new AppError("Cashback redemption not enabled", 400);
    }

    const account = await this.repo.findOrCreateAccount(barbershopId, clientId);
    const entries = await this.repo.getAccountEntries(account.id);

    let balance = 0;
    for (const entry of entries) {
      switch (entry.type) {
        case "VISIT_EARNED":
          balance += 1;
          break;
        case "CASHBACK_EARNED":
          balance += (entry.metadata as any)?.amount ?? 0;
          break;
        case "REWARD_REDEEMED":
          balance -= 1;
          break;
        case "CASHBACK_REDEEMED":
          balance -= (entry.metadata as any)?.amount ?? 0;
          break;
        case "MANUAL_ADJUSTMENT":
          balance += (entry.metadata as any)?.delta ?? 0;
          break;
      }
    }

    if (balance < amount) {
      throw new AppError(`Insufficient cashback balance. Available: R$ ${balance.toFixed(2)}`, 400);
    }

    const entry = await this.repo.createLedgerEntry({
      barbershopId,
      accountId: account.id,
      type: "CASHBACK_REDEEMED",
      description: `Cashback de R$ ${amount.toFixed(2)} resgatado`,
      metadata: { amount },
      idempotencyKey,
    });

    return { account, entry, redeemedAmount: amount, newBalance: balance - amount };
  }
}
