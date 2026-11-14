import { injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { toReais } from "../domain/money";
import type {
  IServiceAddonLinkRepository,
  ServiceAddonLinkDto,
  ServiceAddonLinkInput,
} from "../application/ports";
import { MESSAGES } from "@/shared/messages/pt-BR";
import { AppError } from "@/shared/errors/AppError";

function toDto(row: {
  id: string;
  barbershopId: string;
  serviceId: string;
  addonId: string;
  priceOverride: unknown;
  timeOverride: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  addon?: {
    id: string;
    name: string;
    price: unknown;
    durationMinutes: number;
    active: boolean;
    availableOnline: boolean;
    maxQuantity: number;
    commissionable: boolean;
  } | null;
}): ServiceAddonLinkDto {
  return {
    id: row.id,
    barbershopId: row.barbershopId,
    serviceId: row.serviceId,
    addonId: row.addonId,
    priceOverride:
      row.priceOverride === null || row.priceOverride === undefined
        ? null
        : toReais(Number(row.priceOverride)),
    timeOverride: row.timeOverride,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.addon
      ? {
          addon: {
            id: row.addon.id,
            name: row.addon.name,
            price: toReais(Number(row.addon.price)),
            durationMinutes: row.addon.durationMinutes,
            active: row.addon.active,
            availableOnline: row.addon.availableOnline,
            maxQuantity: row.addon.maxQuantity,
            commissionable: row.addon.commissionable,
          },
        }
      : {}),
  };
}

const select = {
  id: true,
  barbershopId: true,
  serviceId: true,
  addonId: true,
  priceOverride: true,
  timeOverride: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  addon: {
    select: {
      id: true,
      name: true,
      price: true,
      durationMinutes: true,
      active: true,
      availableOnline: true,
      maxQuantity: true,
      commissionable: true,
    },
  },
} as const;

@injectable()
export class PrismaServiceAddonLinkRepository implements IServiceAddonLinkRepository {
  async listByService(
    barbershopId: string,
    serviceId: string
  ): Promise<ServiceAddonLinkDto[]> {
    const rows = await prisma.serviceAddonLink.findMany({
      where: { barbershopId, serviceId, addon: { deletedAt: null } },
      select,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toDto);
  }

  async replaceForService(
    barbershopId: string,
    serviceId: string,
    links: readonly ServiceAddonLinkInput[]
  ): Promise<ServiceAddonLinkDto[]> {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, barbershopId },
      select: { id: true },
    });
    if (!service) throw new AppError(MESSAGES.addons.serviceNotFound, 404);

    // Substituição atômica dos vínculos do serviço.
    await prisma.$transaction([
      prisma.serviceAddonLink.deleteMany({ where: { barbershopId, serviceId } }),
      ...(links.length > 0
        ? [
            prisma.serviceAddonLink.createMany({
              data: links.map((link, index) => ({
                barbershopId,
                serviceId,
                addonId: link.addonId,
                priceOverride: link.priceOverride ?? null,
                timeOverride: link.timeOverride ?? null,
                sortOrder: link.sortOrder ?? index,
              })),
            }),
          ]
        : []),
    ]);

    return this.listByService(barbershopId, serviceId);
  }
}
