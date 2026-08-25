import { prisma } from "@/libs/prismaClient";

export interface ICreateAuditLogDTO {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
}

export async function createAuditLog(data: ICreateAuditLogDTO) {
  await prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      details: data.details,
      ipAddress: data.ipAddress,
    },
  });
}