import { prisma } from "@/libs/prismaClient";

export interface AdminAuditInput {
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  barbershopId?: string;
}

export interface IAdminWhatsAppAuditRepository {
  create(input: AdminAuditInput): Promise<void>;
}

export class AdminWhatsAppAuditRepository implements IAdminWhatsAppAuditRepository {
  async create(input: AdminAuditInput): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        details: JSON.stringify(input.details),
        ipAddress: input.ipAddress,
        barbershopId: input.barbershopId,
      },
    });
  }
}
