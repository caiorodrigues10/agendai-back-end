import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import type { EmployeePermission } from "@/modules/users/dtos/IUserResponseDTO";

export type ProductActor = { id: string; role: string; barbershopId?: string | null };

const COST_PERMISSIONS: EmployeePermission[] = [
  "PRODUCTS_MANAGE",
  "INVENTORY_MANAGE",
  "FINANCE_VIEW",
  "PRODUCT_REPORTS_VIEW",
];

export function isPrivilegedActor(user: ProductActor): boolean {
  return user.role === "MASTER_ADMIN" || user.role === "OWNER";
}

export async function loadEmployeePermissions(userId: string): Promise<EmployeePermission[]> {
  const record = await prisma.user.findUnique({ where: { id: userId }, select: { permissions: true } });
  return (record?.permissions ?? []) as EmployeePermission[];
}

export async function assertProductPermission(
  user: ProductActor,
  barbershopId: string,
  permission: EmployeePermission | EmployeePermission[]
): Promise<EmployeePermission[]> {
  if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);
  if (isPrivilegedActor(user)) return COST_PERMISSIONS;
  if (user.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);
  const permissions = await loadEmployeePermissions(user.id);
  const needed = Array.isArray(permission) ? permission : [permission];
  if (!needed.some((perm) => permissions.includes(perm))) {
    throw new AppError("Você não possui permissão para esta ação de produtos", 403);
  }
  return permissions;
}

export function canSeeProductCosts(user: ProductActor, permissions: EmployeePermission[]): boolean {
  if (isPrivilegedActor(user)) return true;
  return COST_PERMISSIONS.some((perm) => permissions.includes(perm));
}

export function canOverrideProductPrice(user: ProductActor, permissions: EmployeePermission[]): boolean {
  if (isPrivilegedActor(user)) return true;
  return permissions.includes("PRODUCTS_MANAGE");
}
