import { prisma } from "@/libs/prismaClient";

export interface AdminWhatsAppShopListQuery {
  page: number;
  limit: number;
  search?: string;
  aiEnabled?: boolean;
}

export interface AdminWhatsAppShopListItem {
  id: string;
  name: string;
  city: string | null;
  active: boolean;
  approvalStatus: string;
  whatsappAiEnabled: boolean;
  evolutionInstanceName: string | null;
  createdAt: Date;
  OwnerBotPreference: { enabled: boolean; blocked: boolean; blockedAt: Date | null } | null;
  _count: { aiConversations: number; OwnerBotActionLog: number };
}

export interface AdminWhatsAppShopAiTarget {
  id: string;
  whatsappAiEnabled: boolean;
}

export interface AdminWhatsAppShopAiResult {
  id: string;
  name: string;
  whatsappAiEnabled: boolean;
}

export interface AdminWhatsAppOwnerBotPreference {
  barbershopId: string;
  enabled: boolean;
  blocked: boolean;
  blockedAt: Date | null;
}

export interface AdminWhatsAppShopAuditContext {
  userId: string;
  ipAddress?: string;
  reason: string;
}

export interface AdminWhatsAppOwnerBotPatch {
  enabled?: boolean;
  blocked?: boolean;
  revokeLinks?: boolean;
}

export interface IAdminWhatsAppShopRepository {
  list(query: AdminWhatsAppShopListQuery): Promise<{ shops: AdminWhatsAppShopListItem[]; total: number }>;
  findById(id: string): Promise<{ id: string; name: string; whatsappAiEnabled: boolean } | null>;
  findAiTargets(ids: string[]): Promise<AdminWhatsAppShopAiTarget[]>;
  applyAiBatch(input: {
    targets: AdminWhatsAppShopAiTarget[];
    enabled: boolean;
    audit: AdminWhatsAppShopAuditContext;
  }): Promise<number>;
  applyAiSingle(input: {
    id: string;
    before: boolean;
    enabled: boolean;
    audit: AdminWhatsAppShopAuditContext;
  }): Promise<AdminWhatsAppShopAiResult>;
  applyOwnerBotBatch(input: {
    ids: string[];
    patch: AdminWhatsAppOwnerBotPatch;
    audit: AdminWhatsAppShopAuditContext;
  }): Promise<number>;
  applyOwnerBotSingle(input: {
    id: string;
    patch: AdminWhatsAppOwnerBotPatch;
    audit: AdminWhatsAppShopAuditContext;
  }): Promise<AdminWhatsAppOwnerBotPreference>;
}

function auditData(input: {
  audit: AdminWhatsAppShopAuditContext;
  barbershopId: string;
  details: Record<string, unknown>;
}) {
  return {
    userId: input.audit.userId,
    action: "WHATSAPP_OWNER_BOT_TOGGLE",
    resource: "Barbershop",
    resourceId: input.barbershopId,
    details: JSON.stringify(input.audit.reason ? { reason: input.audit.reason, ...input.details } : input.details),
    ipAddress: input.audit.ipAddress,
    barbershopId: input.barbershopId,
  };
}

export class AdminWhatsAppShopRepository implements IAdminWhatsAppShopRepository {
  async list(query: AdminWhatsAppShopListQuery): Promise<{ shops: AdminWhatsAppShopListItem[]; total: number }> {
    const where = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { city: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(query.aiEnabled === undefined ? {} : { whatsappAiEnabled: query.aiEnabled }),
    };

    const [shops, total] = await Promise.all([
      prisma.barbershop.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          city: true,
          active: true,
          approvalStatus: true,
          whatsappAiEnabled: true,
          evolutionInstanceName: true,
          createdAt: true,
          OwnerBotPreference: { select: { enabled: true, blocked: true, blockedAt: true } },
          _count: { select: { aiConversations: true, OwnerBotActionLog: true } },
        },
      }),
      prisma.barbershop.count({ where }),
    ]);

    return { shops, total };
  }

  findById(id: string) {
    return prisma.barbershop.findUnique({
      where: { id },
      select: { id: true, name: true, whatsappAiEnabled: true },
    });
  }

  findAiTargets(ids: string[]): Promise<AdminWhatsAppShopAiTarget[]> {
    return prisma.barbershop.findMany({
      where: { id: { in: ids } },
      select: { id: true, whatsappAiEnabled: true },
    });
  }

  async applyAiBatch(input: {
    targets: AdminWhatsAppShopAiTarget[];
    enabled: boolean;
    audit: AdminWhatsAppShopAuditContext;
  }): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.barbershop.updateMany({
        where: { id: { in: input.targets.map((target) => target.id) } },
        data: { whatsappAiEnabled: input.enabled },
      });
      for (const target of input.targets) {
        await tx.auditLog.create({
          data: {
            userId: input.audit.userId,
            action: "WHATSAPP_AI_TOGGLE",
            resource: "Barbershop",
            resourceId: target.id,
            details: JSON.stringify({
              reason: input.audit.reason,
              before: target.whatsappAiEnabled,
              after: input.enabled,
              batch: true,
            }),
            ipAddress: input.audit.ipAddress,
            barbershopId: target.id,
          },
        });
      }
      return result.count;
    });
  }

  applyAiSingle(input: {
    id: string;
    before: boolean;
    enabled: boolean;
    audit: AdminWhatsAppShopAuditContext;
  }): Promise<AdminWhatsAppShopAiResult> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.barbershop.update({
        where: { id: input.id },
        data: { whatsappAiEnabled: input.enabled },
        select: { id: true, name: true, whatsappAiEnabled: true },
      });
      await tx.auditLog.create({
        data: {
          userId: input.audit.userId,
          action: "WHATSAPP_AI_TOGGLE",
          resource: "Barbershop",
          resourceId: input.id,
          details: JSON.stringify({
            reason: input.audit.reason,
            before: input.before,
            after: input.enabled,
          }),
          ipAddress: input.audit.ipAddress,
          barbershopId: input.id,
        },
      });
      return updated;
    });
  }

  async applyOwnerBotBatch(input: {
    ids: string[];
    patch: AdminWhatsAppOwnerBotPatch;
    audit: AdminWhatsAppShopAuditContext;
  }): Promise<number> {
    await prisma.$transaction(async (tx) => {
      for (const id of input.ids) {
        await tx.ownerBotPreference.upsert({
          where: { barbershopId: id },
          create: {
            barbershopId: id,
            enabled: input.patch.enabled ?? true,
            blocked: input.patch.blocked ?? false,
            blockedAt: input.patch.blocked ? new Date() : null,
          },
          update: {
            ...(input.patch.enabled !== undefined && { enabled: input.patch.enabled }),
            ...(input.patch.blocked !== undefined && {
              blocked: input.patch.blocked,
              blockedAt: input.patch.blocked ? new Date() : null,
            }),
          },
        });
        await tx.auditLog.create({
          data: auditData({
            audit: input.audit,
            barbershopId: id,
            details: { enabled: input.patch.enabled, blocked: input.patch.blocked, batch: true },
          }),
        });
      }
    });
    return input.ids.length;
  }

  applyOwnerBotSingle(input: {
    id: string;
    patch: AdminWhatsAppOwnerBotPatch;
    audit: AdminWhatsAppShopAuditContext;
  }): Promise<AdminWhatsAppOwnerBotPreference> {
    return prisma.$transaction(async (tx) => {
      const preference = await tx.ownerBotPreference.upsert({
        where: { barbershopId: input.id },
        create: {
          barbershopId: input.id,
          enabled: input.patch.enabled ?? true,
          blocked: input.patch.blocked ?? false,
          blockedAt: input.patch.blocked ? new Date() : null,
        },
        update: {
          ...(input.patch.enabled !== undefined && { enabled: input.patch.enabled }),
          ...(input.patch.blocked !== undefined && {
            blocked: input.patch.blocked,
            blockedAt: input.patch.blocked ? new Date() : null,
          }),
        },
      });
      if (input.patch.revokeLinks) {
        await tx.ownerBotLink.updateMany({
          where: { barbershopId: input.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: auditData({
          audit: input.audit,
          barbershopId: input.id,
          details: {
            enabled: input.patch.enabled,
            blocked: input.patch.blocked,
            revokeLinks: input.patch.revokeLinks,
          },
        }),
      });
      return preference;
    });
  }
}
