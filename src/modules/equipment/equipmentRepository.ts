import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  createEquipmentSchema,
  updateEquipmentSchema,
  createMovementSchema,
  createNeedSchema,
  updateNeedSchema,
  equipmentCategoryMap,
  equipmentConditionMap,
  movementTypeMap,
  needPriorityMap,
  needStatusMap,
} from "./equipmentSchema";
import type { z } from "zod";

type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
type CreateMovementInput = z.infer<typeof createMovementSchema>;
type CreateNeedInput = z.infer<typeof createNeedSchema>;
type UpdateNeedInput = z.infer<typeof updateNeedSchema>;

const equipmentSelect = {
  id: true,
  barbershopId: true,
  name: true,
  category: true,
  brand: true,
  model: true,
  serialNumber: true,
  quantityTotal: true,
  quantityAvailable: true,
  condition: true,
  minQuantity: true,
  unitCost: true,
  supplier: true,
  purchaseDate: true,
  warrantyUntil: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  barbershop: { select: { id: true, name: true } },
} as const;

const movementSelect = {
  id: true,
  equipmentId: true,
  barbershopId: true,
  type: true,
  quantity: true,
  reason: true,
  staffId: true,
  createdAt: true,
  equipment: { select: { id: true, name: true, category: true } },
  user: { select: { id: true, name: true } },
} as const;

const needSelect = {
  id: true,
  barbershopId: true,
  equipmentId: true,
  name: true,
  quantityNeeded: true,
  priority: true,
  reason: true,
  estimatedCost: true,
  status: true,
  requestedBy: true,
  createdAt: true,
  resolvedAt: true,
  equipment: { select: { id: true, name: true, category: true } },
} as const;

export class EquipmentRepository {
  // ─── Equipment CRUD ──────────────────────────────────────

  async listByBarbershop(
    barbershopId: string,
    filters?: { category?: string; isActive?: boolean; condition?: string; search?: string }
  ) {
    return prisma.equipment.findMany({
      where: {
        barbershopId,
        ...(filters?.category ? { category: filters.category.toUpperCase() as any } : {}),
        ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
        ...(filters?.condition ? { condition: filters.condition.toUpperCase() as any } : {}),
        ...(filters?.search
          ? { name: { contains: filters.search, mode: "insensitive" } }
          : {}),
      },
      select: equipmentSelect,
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string) {
    return prisma.equipment.findUnique({
      where: { id },
      select: equipmentSelect,
    });
  }

  async findBySerialNumber(barbershopId: string, serialNumber: string) {
    return prisma.equipment.findFirst({
      where: { barbershopId, serialNumber },
      select: { id: true },
    });
  }

  async create(data: CreateEquipmentInput) {
    const now = new Date();
    return prisma.equipment.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        category: equipmentCategoryMap[data.category],
        brand: data.brand ?? null,
        model: data.model ?? null,
        serialNumber: data.serialNumber ?? null,
        quantityTotal: data.quantityTotal ?? 1,
        quantityAvailable: data.quantityAvailable ?? data.quantityTotal ?? 1,
        condition: equipmentConditionMap[data.condition],
        minQuantity: data.minQuantity ?? 0,
        unitCost: data.unitCost ?? null,
        supplier: data.supplier ?? null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        warrantyUntil: data.warrantyUntil ? new Date(data.warrantyUntil) : null,
        notes: data.notes ?? null,
        updatedAt: now,
      },
      select: equipmentSelect,
    });
  }

  async update(id: string, data: UpdateEquipmentInput) {
    const existing = await prisma.equipment.findUnique({ where: { id } });
    if (!existing) throw new AppError("Equipamento não encontrado", 404);

    return prisma.equipment.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: equipmentCategoryMap[data.category] }),
        ...(data.brand !== undefined && { brand: data.brand }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber }),
        ...(data.quantityTotal !== undefined && { quantityTotal: data.quantityTotal }),
        ...(data.quantityAvailable !== undefined && { quantityAvailable: data.quantityAvailable }),
        ...(data.condition !== undefined && { condition: equipmentConditionMap[data.condition] }),
        ...(data.minQuantity !== undefined && { minQuantity: data.minQuantity }),
        ...(data.unitCost !== undefined && { unitCost: data.unitCost }),
        ...(data.supplier !== undefined && { supplier: data.supplier }),
        ...(data.purchaseDate !== undefined && {
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        }),
        ...(data.warrantyUntil !== undefined && {
          warrantyUntil: data.warrantyUntil ? new Date(data.warrantyUntil) : null,
        }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedAt: new Date(),
      },
      select: equipmentSelect,
    });
  }

  async delete(id: string) {
    const existing = await prisma.equipment.findUnique({ where: { id } });
    if (!existing) throw new AppError("Equipamento não encontrado", 404);
    await prisma.equipment.delete({ where: { id } });
  }

  async updateQuantity(id: string, quantityAvailable: number, quantityTotal?: number) {
    return prisma.equipment.update({
      where: { id },
      data: {
        quantityAvailable,
        ...(quantityTotal !== undefined && { quantityTotal }),
        updatedAt: new Date(),
      },
      select: equipmentSelect,
    });
  }

  // ─── Movements ───────────────────────────────────────────

  async listMovements(barbershopId: string, filters?: { equipmentId?: string; type?: string; dateFrom?: Date; dateTo?: Date }) {
    return prisma.equipmentMovement.findMany({
      where: {
        barbershopId,
        ...(filters?.equipmentId ? { equipmentId: filters.equipmentId } : {}),
        ...(filters?.type ? { type: filters.type.toUpperCase() as any } : {}),
        ...(filters?.dateFrom ? { createdAt: { gte: filters.dateFrom } } : {}),
        ...(filters?.dateTo ? { createdAt: { lte: filters.dateTo } } : {}),
      },
      select: movementSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async createMovement(data: CreateMovementInput) {
    return prisma.equipmentMovement.create({
      data: {
        equipmentId: data.equipmentId,
        barbershopId: data.barbershopId,
        type: movementTypeMap[data.type],
        quantity: data.quantity,
        reason: data.reason ?? null,
        staffId: data.staffId ?? null,
      },
      select: movementSelect,
    });
  }

  // ─── Needs ───────────────────────────────────────────────

  async listNeeds(barbershopId: string, filters?: { status?: string; priority?: string }) {
    return prisma.equipmentNeed.findMany({
      where: {
        barbershopId,
        ...(filters?.status ? { status: filters.status.toUpperCase() as any } : {}),
        ...(filters?.priority ? { priority: filters.priority.toUpperCase() as any } : {}),
      },
      select: needSelect,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  }

  async findNeedById(id: string) {
    return prisma.equipmentNeed.findUnique({
      where: { id },
      select: needSelect,
    });
  }

  async createNeed(data: CreateNeedInput) {
    return prisma.equipmentNeed.create({
      data: {
        barbershopId: data.barbershopId,
        equipmentId: data.equipmentId ?? null,
        name: data.name,
        quantityNeeded: data.quantityNeeded ?? 1,
        priority: needPriorityMap[data.priority],
        reason: data.reason ?? null,
        estimatedCost: data.estimatedCost ?? null,
        requestedBy: data.requestedBy ?? null,
      },
      select: needSelect,
    });
  }

  async updateNeed(id: string, data: UpdateNeedInput) {
    const existing = await prisma.equipmentNeed.findUnique({ where: { id } });
    if (!existing) throw new AppError("Necessidade não encontrada", 404);

    return prisma.equipmentNeed.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: needStatusMap[data.status] }),
        ...(data.priority !== undefined && { priority: needPriorityMap[data.priority] }),
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.estimatedCost !== undefined && { estimatedCost: data.estimatedCost }),
        ...(data.status === "received" ? { resolvedAt: new Date() } : {}),
      },
      select: needSelect,
    });
  }

  // ─── Dashboard ───────────────────────────────────────────

  async countByBarbershop(barbershopId: string) {
    const [total, active, allActive] = await Promise.all([
      prisma.equipment.count({ where: { barbershopId } }),
      prisma.equipment.count({ where: { barbershopId, isActive: true } }),
      prisma.equipment.findMany({
        where: { barbershopId, isActive: true },
        select: { quantityAvailable: true, minQuantity: true },
      }),
    ]);

    const lowStock = allActive.filter(
      (e: { quantityAvailable: number; minQuantity: number }) => e.minQuantity > 0 && e.quantityAvailable < e.minQuantity
    ).length;

    const pendingNeeds = await prisma.equipmentNeed.count({
      where: { barbershopId, status: "REQUESTED" },
    });

    const recentMovements = await prisma.equipmentMovement.count({
      where: {
        barbershopId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    return {
      totalEquipment: total,
      activeEquipment: active,
      lowStockCount: lowStock,
      pendingNeeds,
      recentMovements,
    };
  }

  async getLowStockItems(barbershopId: string) {
    const allActive = await prisma.equipment.findMany({
      where: { barbershopId, isActive: true },
      select: {
        id: true,
        name: true,
        category: true,
        quantityTotal: true,
        quantityAvailable: true,
        minQuantity: true,
        condition: true,
      },
      orderBy: { quantityAvailable: "asc" },
    });

    return allActive.filter(
      (e: { minQuantity: number; quantityAvailable: number }) => e.minQuantity > 0 && e.quantityAvailable < e.minQuantity
    );
  }
}
