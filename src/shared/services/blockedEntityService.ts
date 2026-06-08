import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { normalizeCpf } from "@/shared/utils/cpfUtils";

export type BlockedEntityType = "CPF" | "CNPJ";

interface BlockOptions {
  type: BlockedEntityType;
  value: string;
  reason: string;
  barbershopId?: string;
  blockedBy?: string;        // "system" ou userId do admin
  externalRef?: string;
  /** Se true, não lança erro quando já existe bloqueio ativo — apenas retorna o existente */
  idempotent?: boolean;
}

interface UnblockOptions {
  type: BlockedEntityType;
  value: string;
  unblockedBy: string;       // "system" (webhook) | userId do admin
  externalRef?: string;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function createAdminNotification(
  type: string,
  title: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  try {
    await prisma.adminNotification.create({
      data: {
        type: type as any,
        title,
        message,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    });
  } catch (err) {
    // Notificação nunca deve derrubar o fluxo principal
    console.warn("[AdminNotification] Falha ao criar notificação:", err);
  }
}

async function createAuditLog(
  userId: string,
  action: string,
  resource: string,
  resourceId: string,
  details: Record<string, unknown>
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details: JSON.stringify(details)
      }
    });
  } catch (err) {
    console.warn("[AuditLog] Falha ao criar log:", err);
  }
}

// ─── Serviço principal ────────────────────────────────────────────────────────

/**
 * Bloqueia um CPF (ou CNPJ).
 * - Idempotente por padrão: se já existe bloqueio ativo, não cria duplicata.
 * - Registra auditoria e notificação para o painel admin.
 */
export async function blockEntity(opts: BlockOptions) {
  const value =
    opts.type === "CPF"
      ? normalizeCpf(opts.value)
      : opts.value.replace(/\D/g, "");

  // Verifica se já existe bloqueio ativo
  const existing = await prisma.blockedEntity.findFirst({
    where: { type: opts.type, value, isActive: true }
  });

  if (existing) {
    if (opts.idempotent !== false) return existing;
    throw new AppError(`${opts.type} ${value} já está bloqueado`, 409);
  }

  const blocked = await prisma.blockedEntity.create({
    data: {
      type: opts.type,
      value,
      reason: opts.reason,
      barbershopId: opts.barbershopId ?? null,
      blockedBy: opts.blockedBy ?? "system",
      externalRef: opts.externalRef ?? null,
      isActive: true
    }
  });

  // UUID fixo do usuário-sistema (criado no seed)
  const auditUserId =
    opts.blockedBy && opts.blockedBy !== "system"
      ? opts.blockedBy
      : "00000000-0000-0000-0000-000000000000";

  await createAuditLog(auditUserId, "BLOCK_ENTITY", "BlockedEntity", blocked.id, {
    type: opts.type,
    value,
    reason: opts.reason,
    barbershopId: opts.barbershopId
  });

  await createAdminNotification(
    "BLOCK_AUTO",
    `${opts.type} bloqueado automaticamente`,
    `${opts.type} ${value} foi bloqueado. Motivo: ${opts.reason}`,
    {
      blockedEntityId: blocked.id,
      type: opts.type,
      value,
      barbershopId: opts.barbershopId
    }
  );

  return blocked;
}

/**
 * Desbloqueia um CPF (ou CNPJ).
 * - Marca isActive = false e registra quem desbloqueou.
 * - Cria notificação para o painel admin.
 */
export async function unblockEntity(opts: UnblockOptions) {
  const value =
    opts.type === "CPF"
      ? normalizeCpf(opts.value)
      : opts.value.replace(/\D/g, "");

  const existing = await prisma.blockedEntity.findFirst({
    where: { type: opts.type, value, isActive: true }
  });

  if (!existing) return null; // já desbloqueado — idempotente

  const unblocked = await prisma.blockedEntity.update({
    where: { id: existing.id },
    data: {
      isActive: false,
      unblockedAt: new Date(),
      unblockedBy: opts.unblockedBy,
      externalRef: opts.externalRef ?? existing.externalRef
    }
  });

  const isSystem = opts.unblockedBy === "system";
  const auditUserId = isSystem
    ? "00000000-0000-0000-0000-000000000000"
    : opts.unblockedBy;

  await createAuditLog(
    auditUserId,
    isSystem ? "UNBLOCK_ENTITY_AUTO" : "UNBLOCK_ENTITY_MANUAL",
    "BlockedEntity",
    unblocked.id,
    {
      type: opts.type,
      value,
      unblockedBy: opts.unblockedBy,
      externalRef: opts.externalRef
    }
  );

  const notifType = isSystem ? "UNBLOCK_AUTO" : "UNBLOCK_MANUAL";
  const notifTitle = isSystem
    ? `${opts.type} desbloqueado automaticamente (pagamento confirmado)`
    : `${opts.type} desbloqueado manualmente pelo admin`;

  await createAdminNotification(
    notifType,
    notifTitle,
    `${opts.type} ${value} foi desbloqueado. Operador: ${opts.unblockedBy}. Ref: ${opts.externalRef ?? "—"}`,
    {
      blockedEntityId: unblocked.id,
      type: opts.type,
      value,
      unblockedBy: opts.unblockedBy
    }
  );

  return unblocked;
}

/**
 * Verifica se um CPF está bloqueado.
 * Lança AppError 403 se estiver, informando o motivo.
 */
export async function assertCpfNotBlocked(cpf: string): Promise<void> {
  const normalized = normalizeCpf(cpf);
  const blocked = await prisma.blockedEntity.findFirst({
    where: { type: "CPF", value: normalized, isActive: true }
  });

  if (blocked) {
    throw new AppError(
      JSON.stringify({
        code: "CPF_BLOCKED",
        message:
          "Seu CPF está bloqueado por inadimplência. Regularize seu plano para continuar.",
        reason: blocked.reason,
        blockedAt: blocked.blockedAt
      }),
      403
    );
  }
}

/** Retorna o bloqueio ativo de um CPF, ou null. */
export async function findActiveCpfBlock(cpf: string) {
  const normalized = normalizeCpf(cpf);
  return prisma.blockedEntity.findFirst({
    where: { type: "CPF", value: normalized, isActive: true }
  });
}