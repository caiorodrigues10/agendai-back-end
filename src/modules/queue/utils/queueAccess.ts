import { AppError } from "@/shared/errors/AppError";
import type { QueueStatus } from "../dtos/IQueueItemResponseDTO";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("queue-access");

export type QueueRequestingUser = {
  id: string;
  role: string;
  barbershopId?: string;
};

const VALID_STATUSES: readonly QueueStatus[] = [
  "waiting",
  "in_chair",
  "completed",
  "cancelled",
] as const;

/** Transições permitidas (origem → destinos). Terminais não saem. */
const ALLOWED_TRANSITIONS: Record<QueueStatus, readonly QueueStatus[]> = {
  waiting: ["in_chair", "cancelled"],
  in_chair: ["completed", "cancelled", "waiting"],
  completed: [],
  cancelled: [],
};

export function parseQueueStatus(raw: string): QueueStatus {
  const normalized = raw.trim().toLowerCase() as QueueStatus;
  if (!VALID_STATUSES.includes(normalized)) {
    throw new AppError(
      `Status de fila inválido: ${raw}. Aceitos: ${VALID_STATUSES.join(", ")}`,
      400
    );
  }
  return normalized;
}

export function assertQueueStatusTransition(
  from: QueueStatus,
  to: QueueStatus
): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError(
      `Transição de fila não permitida: ${from} → ${to}`,
      409
    );
  }
}

export function assertQueueTenantAccess(
  itemBarbershopId: string,
  user: QueueRequestingUser
): void {
  if (user.role === "MASTER_ADMIN") return;
  if (!user.barbershopId || user.barbershopId !== itemBarbershopId) {
    logger.error(
      {
        event: "tenant_access_denied",
        resource: "queue",
        userId: user.id,
        userRole: user.role,
      },
      "Acesso negado: item de fila de outro estabelecimento"
    );
    throw new AppError(
      "Acesso negado: item de fila de outro estabelecimento",
      403
    );
  }
}

/** Staff só conta se autenticado e (admin ou do mesmo salão). */
export function isQueueStaffForShop(
  user: QueueRequestingUser | undefined,
  barbershopId: string
): boolean {
  if (!user) return false;
  if (!["MASTER_ADMIN", "OWNER", "EMPLOYEE"].includes(user.role)) return false;
  if (user.role === "MASTER_ADMIN") return true;
  return user.barbershopId === barbershopId;
}
