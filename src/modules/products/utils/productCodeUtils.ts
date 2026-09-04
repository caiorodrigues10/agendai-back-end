import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { Prisma } from "@/libs/prismaClient";

export function normalizeCode(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function assertUniqueProductCode(opts: {
  barbershopId: string;
  sku?: string | null;
  barcode?: string | null;
  excludeId?: string;
}): Promise<void> {
  const sku = normalizeCode(opts.sku);
  const barcode = normalizeCode(opts.barcode);
  if (sku) {
    const existing = await prisma.product.findFirst({
      where: {
        barbershopId: opts.barbershopId,
        sku,
        ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("Já existe um produto com este SKU neste salão.", 409, undefined, "PRODUCT_SKU_DUPLICATE");
    }
  }
  if (barcode) {
    const existing = await prisma.product.findFirst({
      where: {
        barbershopId: opts.barbershopId,
        barcode,
        ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("Já existe um produto com este código neste salão.", 409, undefined, "PRODUCT_BARCODE_DUPLICATE");
    }
  }
}

export function isProductUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function throwProductUniqueViolation(): never {
  throw new AppError("Já existe um produto com este SKU/código neste salão.", 409, undefined, "PRODUCT_CODE_DUPLICATE");
}
