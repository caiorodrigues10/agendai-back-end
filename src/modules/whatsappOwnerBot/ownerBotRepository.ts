import { prisma } from "@/libs/prismaClient";
import type { OwnerBotActionStatus } from "@prisma/client";

/**
 * Acesso a dados do assistente. Fica isolado aqui para que o serviço de
 * conversa nunca dependa do Prisma diretamente (facilita testes).
 */

export class OwnerBotRepository {
  // ─── Estabelecimento e usuário ─────────────────────────────────────────────

  async findShop(barbershopId: string) {
    return prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        id: true,
        name: true,
        businessSegment: true,
        whatsapp: true,
        active: true,
      },
    });
  }

  async findUser(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, barbershopId: true, active: true },
    });
  }

  // ─── Códigos de vínculo ────────────────────────────────────────────────────

  /** Invalida os códigos pendentes anteriores do usuário (um código ativo só). */
  async invalidatePendingLinkCodes(userId: string): Promise<void> {
    await prisma.ownerBotLinkCode.updateMany({
      where: { userId, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
  }

  async createLinkCode(data: {
    userId: string;
    barbershopId: string;
    codeHash: string;
    expiresAt: Date;
    ipAddress?: string | null;
  }) {
    return prisma.ownerBotLinkCode.create({
      data: {
        userId: data.userId,
        barbershopId: data.barbershopId,
        codeHash: data.codeHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress ?? null,
      },
      select: { id: true, expiresAt: true },
    });
  }

  /** Código pendente mais recente com o hash informado. */
  async findPendingLinkCode(codeHash: string) {
    return prisma.ownerBotLinkCode.findFirst({
      where: { codeHash, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        barbershopId: true,
        codeHash: true,
        attempts: true,
        maxAttempts: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async incrementLinkCodeAttempts(id: string): Promise<{ attempts: number; maxAttempts: number }> {
    const updated = await prisma.ownerBotLinkCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true, maxAttempts: true },
    });
    if (updated.attempts >= updated.maxAttempts) {
      await prisma.ownerBotLinkCode.update({
        where: { id },
        data: { status: "FAILED" },
      });
    }
    return updated;
  }

  async consumeLinkCode(id: string): Promise<void> {
    await prisma.ownerBotLinkCode.update({
      where: { id },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });
  }

  // ─── Vínculos ──────────────────────────────────────────────────────────────

  async findActiveLinksByPhone(normalizedPhone: string) {
    return prisma.ownerBotLink.findMany({
      where: { normalizedPhone, revokedAt: null },
      orderBy: { linkedAt: "desc" },
      select: {
        id: true,
        userId: true,
        barbershopId: true,
        normalizedPhone: true,
        linkedAt: true,
        user: { select: { id: true, name: true, role: true, active: true } },
        barbershop: {
          select: { id: true, name: true, businessSegment: true, whatsapp: true, active: true },
        },
      },
    });
  }

  async findActiveLinksByUser(userId: string) {
    return prisma.ownerBotLink.findMany({
      where: { userId, revokedAt: null },
      orderBy: { linkedAt: "asc" },
      select: {
        id: true,
        barbershopId: true,
        normalizedPhone: true,
        linkedAt: true,
        barbershop: {
          select: { id: true, name: true, businessSegment: true, whatsapp: true, active: true },
        },
      },
    });
  }

  async findActiveLinkByPhoneAndShop(normalizedPhone: string, barbershopId: string) {
    return prisma.ownerBotLink.findFirst({
      where: { normalizedPhone, barbershopId, revokedAt: null },
      select: { id: true, userId: true, barbershopId: true, normalizedPhone: true },
    });
  }

  async createLink(data: {
    userId: string;
    barbershopId: string;
    normalizedPhone: string;
  }) {
    return prisma.ownerBotLink.create({
      data: data,
      select: { id: true, userId: true, barbershopId: true, normalizedPhone: true },
    });
  }

  async revokeLink(id: string): Promise<void> {
    await prisma.ownerBotLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoga vínculos do MESMO número que pertencem a outro dono. */
  async revokeLinksOfOtherUsers(normalizedPhone: string, userId: string): Promise<number> {
    const result = await prisma.ownerBotLink.updateMany({
      where: { normalizedPhone, revokedAt: null, userId: { not: userId } },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async touchLink(id: string): Promise<void> {
    await prisma.ownerBotLink.update({
      where: { id },
      data: { lastSeenAt: new Date() },
    });
  }

  // ─── Auditoria ─────────────────────────────────────────────────────────────

  async logAction(data: {
    barbershopId: string;
    userId?: string | null;
    phoneMasked?: string | null;
    action: string;
    status?: OwnerBotActionStatus;
    request?: unknown;
    result?: unknown;
    errorMessage?: string | null;
    commandId?: string | null;
    riskClass?: string | null;
    affectedIds?: string[];
    canUndo?: boolean;
  }): Promise<string> {
    const created = await prisma.ownerBotActionLog.create({
      data: {
        barbershopId: data.barbershopId,
        userId: data.userId ?? null,
        phoneMasked: data.phoneMasked ?? null,
        action: data.action,
        status: data.status ?? "SUCCESS",
        request: (data.request ?? {}) as object,
        result: (data.result ?? null) as never,
        errorMessage: data.errorMessage?.slice(0, 300) ?? null,
        commandId: data.commandId ?? null,
        riskClass: data.riskClass ?? null,
        affectedIds: data.affectedIds ?? [],
        canUndo: data.canUndo ?? false,
      },
      select: { id: true },
    });
    return created.id;
  }

  async listActionLogs(
    barbershopId: string,
    filters: {
      limit?: number;
      from?: Date;
      to?: Date;
      commandId?: string;
      riskClass?: string;
      status?: OwnerBotActionStatus;
    } = {}
  ) {
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    return prisma.ownerBotActionLog.findMany({
      where: {
        barbershopId,
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(filters.commandId ? { commandId: filters.commandId } : {}),
        ...(filters.riskClass ? { riskClass: filters.riskClass } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        status: true,
        phoneMasked: true,
        createdAt: true,
        request: true,
        result: true,
        errorMessage: true,
        commandId: true,
        riskClass: true,
        affectedIds: true,
        canUndo: true,
        undoneAt: true,
      },
    });
  }

  /** Marca a ação como desfeita (janela de 2 minutos após uma escrita). */
  async markActionUndone(id: string): Promise<void> {
    await prisma.ownerBotActionLog.update({
      where: { id },
      data: { undoneAt: new Date() },
    });
  }

  /** Última ação desfezível ainda dentro da janela. */
  async findUndoableAction(barbershopId: string, userId: string, since: Date) {
    return prisma.ownerBotActionLog.findFirst({
      where: {
        barbershopId,
        userId,
        canUndo: true,
        undoneAt: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        commandId: true,
        affectedIds: true,
        request: true,
        createdAt: true,
      },
    });
  }

  // ─── Preferências ──────────────────────────────────────────────────────────

  async getPreferences(barbershopId: string) {
    return prisma.ownerBotPreference.findUnique({ where: { barbershopId } });
  }

  async upsertPreferences(
    barbershopId: string,
    data: Partial<{
      enabled: boolean;
      blocked: boolean;
      blockedAt: Date | null;
      briefingEnabled: boolean;
      briefingTime: string;
      summaryEnabled: boolean;
      summaryTime: string;
      alertsEnabled: boolean;
      alertTypes: string[];
      tone: string;
      language: string;
      lastBriefingAt: Date | null;
      lastSummaryAt: Date | null;
    }>
  ) {
    return prisma.ownerBotPreference.upsert({
      where: { barbershopId },
      create: { barbershopId, ...data },
      update: data,
    });
  }

  /** Preferências de todos os salões com assistente ativo (para os jobs). */
  async listEnabledPreferences() {
    return prisma.ownerBotPreference.findMany({
      where: { enabled: true, blocked: false },
      select: {
        barbershopId: true,
        briefingEnabled: true,
        briefingTime: true,
        summaryEnabled: true,
        summaryTime: true,
        alertsEnabled: true,
        alertTypes: true,
        tone: true,
      },
    });
  }

  /** Números dono vinculados a um estabelecimento (para empurrar briefing/resumo). */
  async findActiveOwnerPhonesByShop(barbershopId: string) {
    const links = await prisma.ownerBotLink.findMany({
      where: { barbershopId, revokedAt: null },
      orderBy: { linkedAt: "asc" },
      select: { normalizedPhone: true },
    });
    return links.map((link) => link.normalizedPhone);
  }

  /** Marca o envio do briefing/resumo do dia (evita duplicar no mesmo dia). */
  async markPushSent(barbershopId: string, kind: "briefing" | "summary", at: Date): Promise<void> {
    await prisma.ownerBotPreference.upsert({
      where: { barbershopId },
      create: {
        barbershopId,
        ...(kind === "briefing" ? { lastBriefingAt: at } : { lastSummaryAt: at }),
      },
      update: kind === "briefing" ? { lastBriefingAt: at } : { lastSummaryAt: at },
    });
  }

  // ─── Campanhas ─────────────────────────────────────────────────────────────

  async createCampaign(data: {
    barbershopId: string;
    userId: string;
    kind: string;
    audienceCount: number;
    messagePreview: string;
    recipientIds: string[];
  }) {
    return prisma.ownerBotCampaign.create({
      data: {
        barbershopId: data.barbershopId,
        userId: data.userId,
        kind: data.kind,
        audienceCount: data.audienceCount,
        messagePreview: data.messagePreview,
        recipientIds: data.recipientIds,
      },
      select: { id: true },
    });
  }

  async updateCampaign(
    id: string,
    data: { status?: string; sentCount?: number; sentAt?: Date }
  ): Promise<void> {
    await prisma.ownerBotCampaign.update({ where: { id }, data });
  }

  async listCampaigns(barbershopId: string, limit = 20) {
    return prisma.ownerBotCampaign.findMany({
      where: { barbershopId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 50),
      select: {
        id: true,
        kind: true,
        status: true,
        audienceCount: true,
        sentCount: true,
        messagePreview: true,
        createdAt: true,
        sentAt: true,
      },
    });
  }
}
