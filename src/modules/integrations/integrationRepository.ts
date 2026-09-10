import { prisma, Prisma } from "@/libs/prismaClient";

export class IntegrationRepository {
  async findByBarbershop(barbershopId: string) {
    return prisma.integration.findMany({
      where: { barbershopId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string, barbershopId: string) {
    return prisma.integration.findFirst({
      where: { id, barbershopId },
    });
  }

  async create(data: Prisma.IntegrationUncheckedCreateInput) {
    return prisma.integration.create({ data });
  }

  async update(id: string, data: Prisma.IntegrationUncheckedUpdateInput) {
    return prisma.integration.update({ where: { id }, data });
  }

  async upsert(barbershopId: string, type: string, provider: string, data: {
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    status?: string;
  }) {
    return prisma.integration.upsert({
      where: {
        barbershopId_type_provider: { barbershopId, type: type as any, provider },
      },
      create: {
        barbershopId,
        type: type as any,
        provider,
        config: data.config as any ?? {},
        credentials: data.credentials as any ?? {},
        status: (data.status as any) ?? "INACTIVE",
      },
      update: {
        ...(data.config !== undefined ? { config: data.config as any } : {}),
        ...(data.credentials !== undefined ? { credentials: data.credentials as any } : {}),
        ...(data.status !== undefined ? { status: data.status as any } : {}),
      },
    });
  }

  async delete(id: string, barbershopId: string) {
    return prisma.integration.deleteMany({ where: { id, barbershopId } });
  }

  async createSyncLog(integrationId: string, direction: string, status: string, recordsCount: number, errorMessage?: string) {
    return prisma.integrationSyncLog.create({
      data: {
        integrationId,
        direction: direction as any,
        status: status as any,
        recordsCount,
        errorMessage: errorMessage ?? null,
        completedAt: status === "SUCCESS" || status === "PARTIAL" ? new Date() : null,
      },
    });
  }

  async getSyncLogs(integrationId: string, limit = 50, offset = 0) {
    return prisma.integrationSyncLog.findMany({
      where: { integrationId },
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async countSyncLogs(integrationId: string) {
    return prisma.integrationSyncLog.count({ where: { integrationId } });
  }
}
