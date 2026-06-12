import { Prisma } from "@prisma/client";
import {
  IServiceCategoryResponseDTO,
  IExpenseCategoryResponseDTO,
} from "../../../services/dtos/ICategoryDTO"

export type ServiceCategoryRecord = Prisma.ServiceCategoryGetPayload<Record<string, never>>;
export type ExpenseCategoryRecord = Prisma.ExpenseCategoryGetPayload<Record<string, never>>;

export function mapServiceCategoryToDTO(r: ServiceCategoryRecord): IServiceCategoryResponseDTO {
  return {
    id: r.id,
    barbershopId: r.barbershopId ?? null,
    isGlobal: r.barbershopId === null,
    name: r.name,
    description: r.description ?? null,
    icon: r.icon ?? null,
    color: r.color ?? null,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function mapExpenseCategoryToDTO(r: ExpenseCategoryRecord): IExpenseCategoryResponseDTO {
  return {
    id: r.id,
    barbershopId: r.barbershopId ?? null,
    isGlobal: r.barbershopId === null,
    name: r.name,
    description: r.description ?? null,
    icon: r.icon ?? null,
    color: r.color ?? null,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}