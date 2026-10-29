/**
 * Processador de linhas de serviços.
 *
 * Serviço é identificado pelo nome dentro do salão: se já existe (mesmo nome,
 * ignorando maiúsculas e acentos), a linha é pulada em vez de duplicar o
 * catálogo. Categoria é criada quando não existir.
 */
import { normalizeInteger, normalizeMoney } from "../utils/rowNormalization";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import type { AppTx } from "@/libs/prismaClient";

/** Ícone padrão do serviço importado — neutro, sem emoticon do segmento. */
const DEFAULT_SERVICE_ICON = "•";
const DEFAULT_DURATION_MINUTES = 30;

export async function importServiceRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<ProcessedRow> {
  const rawName = cellValue(row, context, "serviceName");
  const name = rawName.slice(0, 100);
  if (name.length < 2) {
    return {
      status: "FAILED",
      entityType: "SERVICE",
      message: "Nome do serviço ausente ou muito curto.",
    };
  }

  const existing = await tx.service.findFirst({
    where: {
      barbershopId,
      active: true,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (existing) {
    return {
      status: "SKIPPED",
      entityType: "SERVICE",
      entityId: existing.id,
      message: "Serviço já existe no catálogo.",
    };
  }

  const price = normalizeMoney(cellValue(row, context, "price"));
  if (price === null && cellValue(row, context, "price")) {
    return {
      status: "FAILED",
      entityType: "SERVICE",
      message: "Preço inválido. Use número, ex.: 50 ou 50,00.",
    };
  }

  const duration = normalizeInteger(cellValue(row, context, "durationMinutes"));
  if (duration === null && cellValue(row, context, "durationMinutes")) {
    return {
      status: "FAILED",
      entityType: "SERVICE",
      message: "Duração inválida. Use o número de minutos.",
    };
  }

  const categoryName = cellValue(row, context, "category").slice(0, 100);
  let categoryId: string | null = null;
  if (categoryName) {
    const category = await findOrCreateCategory(tx, barbershopId, categoryName);
    categoryId = category.id;
  }

  const created = await tx.service.create({
    data: {
      barbershopId,
      categoryId,
      name,
      price: price ?? 0,
      avgTimeMinutes: duration && duration > 0 ? duration : DEFAULT_DURATION_MINUTES,
      icon: DEFAULT_SERVICE_ICON,
      active: true,
      // Serviço importado entra no catálogo; a equipe ajusta comissões depois.
      commissionPercent: 0,
      publicBookable: true,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "SERVICE",
    entityId: created.id,
  };
}

/** Categoria do salão (ou global, quando `barbershopId` é nulo). */
async function findOrCreateCategory(
  tx: AppTx,
  barbershopId: string,
  name: string,
): Promise<{ id: string }> {
  const existing = await tx.serviceCategory.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      OR: [{ barbershopId }, { barbershopId: null }],
    },
    select: { id: true, barbershopId: true },
  });

  if (existing) {
    // Categoria global é reutilizada; categoria de outro salão, não.
    if (existing.barbershopId === null || existing.barbershopId === barbershopId) {
      return existing;
    }
  }

  return tx.serviceCategory.create({
    data: { barbershopId, name, active: true },
    select: { id: true },
  });
}
