import { prisma } from "@/libs/prismaClient";

export interface AdminWhatsAppOwnerBotLogQuery {
  page: number;
  limit: number;
  barbershopId?: string;
  riskClass?: string;
  status?: string;
}

export interface AdminWhatsAppOwnerBotLogItem {
  id: string;
  barbershopId: string;
  action: string;
  status: string;
  riskClass: string | null;
  phoneMasked: string | null;
  errorMessage: string | null;
  canUndo: boolean;
  undoneAt: Date | null;
  createdAt: Date;
  barbershop: { name: string } | null;
}

export interface IAdminWhatsAppOwnerBotLogRepository {
  list(query: AdminWhatsAppOwnerBotLogQuery): Promise<{
    logs: AdminWhatsAppOwnerBotLogItem[];
    total: number;
  }>;
}

export class AdminWhatsAppOwnerBotLogRepository implements IAdminWhatsAppOwnerBotLogRepository {
  async list(query: AdminWhatsAppOwnerBotLogQuery) {
    const where = {
      ...(query.barbershopId ? { barbershopId: query.barbershopId } : {}),
      ...(query.riskClass ? { riskClass: query.riskClass as never } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.ownerBotActionLog.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          barbershopId: true,
          action: true,
          status: true,
          riskClass: true,
          phoneMasked: true,
          errorMessage: true,
          canUndo: true,
          undoneAt: true,
          createdAt: true,
          barbershop: { select: { name: true } },
        },
      }),
      prisma.ownerBotActionLog.count({ where }),
    ]);

    return { logs, total };
  }
}
