import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import {
  IServiceCategoryRepository,
  IExpenseCategoryRepository,
} from "../../repositories/ICategoryRepository";
import {
  ICreateServiceCategoryDTO,
  IUpdateServiceCategoryDTO,
  IServiceCategoryResponseDTO,
  ICreateExpenseCategoryDTO,
  IUpdateExpenseCategoryDTO,
  IExpenseCategoryResponseDTO,
} from "@/modules/services/dtos/ICategoryDTO";
import {
  mapServiceCategoryToDTO,
  mapExpenseCategoryToDTO,
} from "./categoryMapper";

// ─── ServiceCategoryRepository ────────────────────────────────────────────────

export class ServiceCategoryRepository implements IServiceCategoryRepository {
  async create(data: ICreateServiceCategoryDTO): Promise<IServiceCategoryResponseDTO> {
    const record = await prisma.serviceCategory.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
      },
    });
    return mapServiceCategoryToDTO(record);
  }

  async findById(id: string): Promise<IServiceCategoryResponseDTO | null> {
    const record = await prisma.serviceCategory.findUnique({ where: { id } });
    return record ? mapServiceCategoryToDTO(record) : null;
  }

  async list(barbershopId?: string, onlyActive = true): Promise<IServiceCategoryResponseDTO[]> {
    const where: Prisma.ServiceCategoryWhereInput = {};

    if (onlyActive) where.active = true;

    if (barbershopId) {
      where.OR = [
        { barbershopId: null },
        { barbershopId },
      ];
    } else {
      where.barbershopId = null;
    }

    const records = await prisma.serviceCategory.findMany({
      where,
      orderBy: [{ barbershopId: "asc" }, { name: "asc" }],
    });

    return records.map(mapServiceCategoryToDTO);
  }

  async update(id: string, data: IUpdateServiceCategoryDTO): Promise<IServiceCategoryResponseDTO> {
    const record = await prisma.serviceCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
    return mapServiceCategoryToDTO(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.serviceCategory.delete({ where: { id } });
  }
}

// ─── ExpenseCategoryRepository ────────────────────────────────────────────────

export class ExpenseCategoryRepository implements IExpenseCategoryRepository {
  async create(data: ICreateExpenseCategoryDTO): Promise<IExpenseCategoryResponseDTO> {
    const record = await prisma.expenseCategory.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
      },
    });
    return mapExpenseCategoryToDTO(record);
  }

  async findById(id: string): Promise<IExpenseCategoryResponseDTO | null> {
    const record = await prisma.expenseCategory.findUnique({ where: { id } });
    return record ? mapExpenseCategoryToDTO(record) : null;
  }

  async list(barbershopId?: string, onlyActive = true): Promise<IExpenseCategoryResponseDTO[]> {
    const where: Prisma.ExpenseCategoryWhereInput = {};

    if (onlyActive) where.active = true;

    if (barbershopId) {
      where.OR = [
        { barbershopId: null },
        { barbershopId },
      ];
    } else {
      where.barbershopId = null;
    }

    const records = await prisma.expenseCategory.findMany({
      where,
      orderBy: [{ barbershopId: "asc" }, { name: "asc" }],
    });

    return records.map(mapExpenseCategoryToDTO);
  }

  async update(id: string, data: IUpdateExpenseCategoryDTO): Promise<IExpenseCategoryResponseDTO> {
    const record = await prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
    return mapExpenseCategoryToDTO(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.expenseCategory.delete({ where: { id } });
  }
}
