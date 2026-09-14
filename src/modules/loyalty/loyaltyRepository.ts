import { prisma } from "@/libs/prismaClient";

export class LoyaltyRepository {
  async findProgram(barbershopId: string) {
    return prisma.loyaltyProgram.findUnique({
      where: { barbershopId },
    });
  }

  async createProgram(barbershopId: string, type: string, config: Record<string, unknown>, isActive = true) {
    return prisma.loyaltyProgram.create({
      data: {
        barbershopId,
        type,
        isActive,
        config: config as any,
      },
    });
  }

  async updateProgram(barbershopId: string, config: Record<string, unknown>, isActive = true) {
    return prisma.loyaltyProgram.update({
      where: { barbershopId },
      data: { config: config as any, isActive },
    });
  }

  async findOrCreateAccount(barbershopId: string, clientId: string) {
    const existing = await prisma.loyaltyAccount.findUnique({
      where: { barbershopId_clientId: { barbershopId, clientId } },
    });
    if (existing) return existing;

    return prisma.loyaltyAccount.create({
      data: { barbershopId, clientId },
    });
  }

  async incrementVisits(barbershopId: string, clientId: string) {
    return prisma.loyaltyAccount.upsert({
      where: { barbershopId_clientId: { barbershopId, clientId } },
      create: { barbershopId, clientId, totalVisits: 1 },
      update: { totalVisits: { increment: 1 } },
    });
  }

  async incrementRewards(barbershopId: string, clientId: string) {
    return prisma.loyaltyAccount.update({
      where: { barbershopId_clientId: { barbershopId, clientId } },
      data: { rewardCount: { increment: 1 } },
    });
  }

  async createLedgerEntry(data: {
    barbershopId: string;
    accountId: string;
    type: string;
    description: string;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) {
    if (data.idempotencyKey) {
      const existing = await prisma.loyaltyLedgerEntry.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return existing;
    }

    return prisma.loyaltyLedgerEntry.create({
      data: {
        barbershopId: data.barbershopId,
        accountId: data.accountId,
        type: data.type,
        description: data.description,
        metadata: data.metadata as any ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
      },
    });
  }

  async getAccountEntries(accountId: string) {
    return prisma.loyaltyLedgerEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
    });
  }
}
