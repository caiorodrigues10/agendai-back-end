import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  createVoucherSchema,
  updateVoucherSchema,
  voucherTypeMap,
} from "./voucherSchema";
import type { z } from "zod";

type CreateInput = z.infer<typeof createVoucherSchema>;
type UpdateInput = z.infer<typeof updateVoucherSchema>;

const voucherSelect = {
  id: true,
  barbershopId: true,
  code: true,
  description: true,
  type: true,
  value: true,
  minPurchase: true,
  maxUses: true,
  usedCount: true,
  perClientLimit: true,
  applicableServiceIds: true,
  startAt: true,
  endAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const usageSelect = {
  id: true,
  voucherId: true,
  clientId: true,
  appointmentId: true,
  discountAmount: true,
  usedAt: true,
  client: { select: { id: true, name: true } },
} as const;

export class VoucherRepository {
  async listByBarbershop(barbershopId: string, activeOnly = false) {
    return prisma.voucher.findMany({
      where: {
        barbershopId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      select: voucherSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return prisma.voucher.findUnique({
      where: { id },
      select: voucherSelect,
    });
  }

  async findByCode(barbershopId: string, code: string) {
    return prisma.voucher.findUnique({
      where: { barbershopId_code: { barbershopId, code: code.toUpperCase() } },
      select: voucherSelect,
    });
  }

  async create(barbershopId: string, data: CreateInput) {
    const existing = await prisma.voucher.findUnique({
      where: { barbershopId_code: { barbershopId, code: data.code } },
    });
    if (existing) throw new AppError("Já existe um voucher com este código nesta barbearia", 409);

    return prisma.voucher.create({
      data: {
        barbershopId,
        code: data.code,
        description: data.description ?? null,
        type: voucherTypeMap[data.type],
        value: data.value,
        minPurchase: data.minPurchase ?? null,
        maxUses: data.maxUses ?? null,
        perClientLimit: data.perClientLimit,
        applicableServiceIds: data.applicableServiceIds ?? null,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        isActive: data.isActive,
      },
      select: voucherSelect,
    });
  }

  async update(id: string, data: UpdateInput) {
    const existing = await prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw new AppError("Voucher não encontrado", 404);

    if (data.code && data.code.toUpperCase() !== existing.code) {
      const duplicate = await prisma.voucher.findUnique({
        where: { barbershopId_code: { barbershopId: existing.barbershopId, code: data.code } },
      });
      if (duplicate) throw new AppError("Já existe um voucher com este código nesta barbearia", 409);
    }

    return prisma.voucher.update({
      where: { id },
      data: {
        ...(data.code !== undefined && { code: data.code }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.type !== undefined && { type: voucherTypeMap[data.type] }),
        ...(data.value !== undefined && { value: data.value }),
        ...(data.minPurchase !== undefined && { minPurchase: data.minPurchase }),
        ...(data.maxUses !== undefined && { maxUses: data.maxUses }),
        ...(data.perClientLimit !== undefined && { perClientLimit: data.perClientLimit }),
        ...(data.applicableServiceIds !== undefined && { applicableServiceIds: data.applicableServiceIds }),
        ...(data.startAt !== undefined && { startAt: new Date(data.startAt) }),
        ...(data.endAt !== undefined && { endAt: new Date(data.endAt) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: voucherSelect,
    });
  }

  async delete(id: string) {
    const existing = await prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw new AppError("Voucher não encontrado", 404);

    await prisma.voucher.delete({ where: { id } });
  }

  async incrementUsedCount(id: string) {
    return prisma.voucher.update({
      where: { id },
      data: { usedCount: { increment: 1 } },
      select: voucherSelect,
    });
  }

  async getUsages(voucherId: string) {
    return prisma.voucherUsage.findMany({
      where: { voucherId },
      select: usageSelect,
      orderBy: { usedAt: "desc" },
    });
  }

  async recordUsage(voucherId: string, clientId: string | null, appointmentId: string | null, discountAmount: number) {
    return prisma.voucherUsage.create({
      data: {
        voucherId,
        clientId: clientId ?? null,
        appointmentId: appointmentId ?? null,
        discountAmount,
      },
      select: usageSelect,
    });
  }

  async countClientUsages(voucherId: string, clientId: string) {
    return prisma.voucherUsage.count({
      where: { voucherId, clientId },
    });
  }
}
