import { injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { toReais } from "../domain/money";
import type {
  CreateSalonAddonInput,
  ISalonAddonRepository,
  SalonAddonDto,
  UpdateSalonAddonInput,
} from "../application/ports";

function toDto(row: {
  id: string;
  barbershopId: string;
  name: string;
  description: string | null;
  price: unknown;
  durationMinutes: number;
  active: boolean;
  availableOnline: boolean;
  maxQuantity: number;
  commissionable: boolean;
  sortOrder: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SalonAddonDto {
  return {
    id: row.id,
    barbershopId: row.barbershopId,
    name: row.name,
    description: row.description,
    price: toReais(Number(row.price)),
    durationMinutes: row.durationMinutes,
    active: row.active,
    availableOnline: row.availableOnline,
    maxQuantity: row.maxQuantity,
    commissionable: row.commissionable,
    sortOrder: row.sortOrder,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const select = {
  id: true,
  barbershopId: true,
  name: true,
  description: true,
  price: true,
  durationMinutes: true,
  active: true,
  availableOnline: true,
  maxQuantity: true,
  commissionable: true,
  sortOrder: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@injectable()
export class PrismaSalonAddonRepository implements ISalonAddonRepository {
  async list(
    barbershopId: string,
    filters?: { serviceId?: string; includeDeleted?: boolean }
  ): Promise<SalonAddonDto[]> {
    const rows = await prisma.salonAddon.findMany({
      where: {
        barbershopId,
        ...(filters?.includeDeleted ? {} : { deletedAt: null }),
        ...(filters?.serviceId
          ? { links: { some: { serviceId: filters.serviceId } } }
          : {}),
      },
      select,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map(toDto);
  }

  async findById(barbershopId: string, id: string): Promise<SalonAddonDto | null> {
    const row = await prisma.salonAddon.findFirst({
      where: { id, barbershopId, deletedAt: null },
      select,
    });
    return row ? toDto(row) : null;
  }

  async create(
    barbershopId: string,
    input: CreateSalonAddonInput
  ): Promise<SalonAddonDto> {
    const row = await prisma.salonAddon.create({
      data: {
        barbershopId,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        durationMinutes: input.durationMinutes ?? 0,
        active: input.active ?? true,
        availableOnline: input.availableOnline ?? true,
        maxQuantity: input.maxQuantity ?? 10,
        commissionable: input.commissionable ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
      select,
    });
    return toDto(row);
  }

  async update(
    barbershopId: string,
    id: string,
    input: UpdateSalonAddonInput
  ): Promise<SalonAddonDto> {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.price !== undefined) data.price = input.price;
    if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes;
    if (input.active !== undefined) data.active = input.active;
    if (input.availableOnline !== undefined) data.availableOnline = input.availableOnline;
    if (input.maxQuantity !== undefined) data.maxQuantity = input.maxQuantity;
    if (input.commissionable !== undefined) data.commissionable = input.commissionable;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    const row = await prisma.salonAddon.update({
      where: { id, barbershopId },
      data,
      select,
    });
    return toDto(row);
  }

  async softDelete(barbershopId: string, id: string): Promise<void> {
    await prisma.salonAddon.update({
      where: { id, barbershopId },
      data: { deletedAt: new Date(), active: false },
    });
  }
}
