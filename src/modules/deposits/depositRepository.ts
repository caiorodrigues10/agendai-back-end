import { prisma } from "@/libs/prismaClient";
import { Prisma } from "@prisma/client";

export interface UpdatePolicyData {
  depositRequired?: boolean;
  depositDefaultPercent?: number;
  depositDefaultAmount?: number;
  depositConfirmHours?: number;
  depositInstructions?: string | null;
  depositPixKey?: string | null;
  depositRefundRule?: string | null;
  noShowDepositRule?: string | null;
}

export interface CreateDepositData {
  barbershopId: string;
  appointmentId: string;
  amount: number;
  pixKey?: string | null;
  expiresAt: Date;
  idempotencyKey?: string | null;
}

export interface ConfirmDepositData {
  pixKey?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface DepositListFilters {
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

export class DepositRepository {
  async getPolicy(barbershopId: string) {
    // Same pattern as GET /appointment-policy: create defaults on first read
    return prisma.appointmentPolicy.upsert({
      where: { barbershopId },
      create: { barbershopId },
      update: {},
    });
  }

  async updatePolicy(barbershopId: string, data: UpdatePolicyData) {
    return prisma.appointmentPolicy.upsert({
      where: { barbershopId },
      create: {
        barbershopId,
        ...data,
      },
      update: data,
    });
  }

  async getDeposit(appointmentId: string) {
    return prisma.appointmentDeposit.findUnique({
      where: { appointmentId },
      include: {
        appointment: {
          select: { id: true, barbershopId: true, customerName: true, status: true },
        },
      },
    });
  }

  async createDeposit(data: CreateDepositData) {
    if (data.idempotencyKey) {
      const existing = await prisma.appointmentDeposit.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return existing;
    }

    return prisma.appointmentDeposit.create({
      data: {
        barbershopId: data.barbershopId,
        appointmentId: data.appointmentId,
        amount: new Prisma.Decimal(data.amount),
        pixKey: data.pixKey ?? null,
        expiresAt: data.expiresAt,
        idempotencyKey: data.idempotencyKey ?? null,
        status: "PENDING",
      },
    });
  }

  async confirmDeposit(depositId: string, userId: string, data: ConfirmDepositData) {
    return prisma.appointmentDeposit.update({
      where: { id: depositId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedById: userId,
        pixKey: data.pixKey ?? undefined,
        notes: data.notes ?? undefined,
      },
    });
  }

  async waiveDeposit(depositId: string, userId: string) {
    return prisma.appointmentDeposit.update({
      where: { id: depositId },
      data: {
        status: "WAIVED",
        waivedAt: new Date(),
        waivedById: userId,
      },
    });
  }

  async refundDeposit(depositId: string, userId: string) {
    return prisma.appointmentDeposit.update({
      where: { id: depositId },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundedById: userId,
      },
    });
  }

  async rejectDeposit(depositId: string, userId: string) {
    return prisma.appointmentDeposit.update({
      where: { id: depositId },
      data: {
        status: "REJECTED",
      },
    });
  }

  async expireDeposits() {
    const now = new Date();
    return prisma.appointmentDeposit.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
      data: {
        status: "EXPIRED",
      },
    });
  }

  async getExpiredPendingDeposits() {
    const now = new Date();
    return prisma.appointmentDeposit.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
      include: {
        appointment: {
          select: { id: true, barbershopId: true, serviceId: true, date: true, time: true, status: true },
        },
      },
    });
  }

  async listDeposits(barbershopId: string, filters: DepositListFilters) {
    const where: Prisma.AppointmentDepositWhereInput = { barbershopId };

    if (filters.status) {
      where.status = filters.status as any;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.appointmentDeposit.findMany({
        where,
        include: {
          appointment: {
            select: { id: true, customerName: true, whatsapp: true, date: true, time: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.appointmentDeposit.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
