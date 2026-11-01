import { prisma } from "@/libs/prismaClient";

export interface AdminWhatsAppInstanceShop {
  id: string;
  name: string;
  evolutionInstanceName: string | null;
}

export interface IAdminWhatsAppInstanceRepository {
  findShop(id: string): Promise<AdminWhatsAppInstanceShop | null>;
  listShops(input: {
    page: number;
    limit: number;
  }): Promise<{ shops: AdminWhatsAppInstanceShop[]; total: number }>;
}

export class AdminWhatsAppInstanceRepository implements IAdminWhatsAppInstanceRepository {
  findShop(id: string): Promise<AdminWhatsAppInstanceShop | null> {
    return prisma.barbershop.findUnique({
      where: { id },
      select: { id: true, name: true, evolutionInstanceName: true },
    });
  }

  async listShops(input: {
    page: number;
    limit: number;
  }): Promise<{ shops: AdminWhatsAppInstanceShop[]; total: number }> {
    const where = { evolutionInstanceName: { not: null } };
    const [shops, total] = await Promise.all([
      prisma.barbershop.findMany({
        where,
        select: { id: true, name: true, evolutionInstanceName: true },
        orderBy: { name: "asc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      prisma.barbershop.count({ where }),
    ]);

    return { shops, total };
  }
}
