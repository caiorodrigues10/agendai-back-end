import { AppError } from "@/shared/errors/AppError";

export type RequestingUser = { id?: string; role: string; barbershopId?: string };

/**
 * Bloqueia OWNER editando recurso de outro salão (IDOR entre tenants).
 * MASTER_ADMIN opera em qualquer salão.
 */
export function assertShopAccess(requestingUser: RequestingUser | undefined, barbershopId: string): void {
  if (!requestingUser) {
    throw new AppError("Token ausente", 401);
  }
  if (requestingUser.role !== "MASTER_ADMIN" && barbershopId !== requestingUser.barbershopId) {
    throw new AppError("Acesso negado: você não pertence a este salão", 403);
  }
}
