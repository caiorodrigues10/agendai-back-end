/**
 * Processador de linhas de pacote.
 *
 * Dois alvos usam este arquivo:
 *   • `SERVICE_PACKAGES` — catálogo de pacotes (o que o salão vende);
 *   • `CLIENT_PACKAGES`  — saldo de pacotes já comprados por clientes.
 *
 * Regras do catálogo:
 *   • o serviço do pacote precisa já existir no catálogo;
 *   • pacote com o mesmo nome **e** mesmo serviço é ignorado (não duplica);
 *   • o catálogo não mexe em dinheiro: preço é só o valor de venda.
 *
 * Regras do saldo do cliente:
 *   • o cliente é identificado pelo WhatsApp; se ainda não existir, ele é
 *     criado (sem marketing, sem mensagem) e vinculado ao lote para o
 *     desfazer removê-lo;
 *   • o pacote precisa existir no catálogo;
 *   • o saldo entra como **saldo inicial**: `ClientPackage` é criado direto,
 *     sem `PACKAGE_SALE` no ledger financeiro e sem evento no ledger do CRM —
 *     importar saldo não é vender pacote (não há caixa, não há receita).
 */
import { salonClientDisplayName } from "@/modules/clients/utils/ensureSalonClient";
import { normalizeDate, normalizeInteger, normalizeMoney } from "../utils/rowNormalization";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import { lookupClientByPhone, lookupService, lookupServicePackage } from "./lookups";
import { normalizePhone } from "../utils/rowNormalization";
import type { AppTx } from "@/libs/prismaClient";

export interface PackageImportResult extends ProcessedRow {
  createdClientId?: string | null;
}

/**
 * Catálogo de pacotes (`SERVICE_PACKAGES`).
 */
export async function importServicePackageRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<PackageImportResult> {
  const rawName = cellValue(row, context, "packageName");
  const name = rawName.slice(0, 100);
  if (name.length < 2) {
    return {
      status: "FAILED",
      entityType: "SERVICE_PACKAGE",
      field: "packageName",
      message: "Nome do pacote ausente ou muito curto.",
    };
  }

  const rawService = cellValue(row, context, "serviceName");
  if (!rawService) {
    return {
      status: "FAILED",
      entityType: "SERVICE_PACKAGE",
      field: "serviceName",
      message: "Serviço do pacote ausente.",
    };
  }

  const service = await lookupService(tx, barbershopId, rawService);
  if (service.status === "NOT_FOUND") {
    return {
      status: "FAILED",
      entityType: "SERVICE_PACKAGE",
      field: "serviceName",
      message: `Serviço "${rawService}" não existe no catálogo. Importe os serviços antes dos pacotes.`,
    };
  }
  if (service.status === "AMBIGUOUS") {
    return {
      status: "FAILED",
      entityType: "SERVICE_PACKAGE",
      field: "serviceName",
      message: `O serviço "${rawService}" corresponde a ${service.count} cadastros no catálogo.`,
    };
  }

  const sessionCount = normalizeInteger(cellValue(row, context, "sessionCount"));
  if (sessionCount === null || sessionCount <= 0) {
    return {
      status: "FAILED",
      entityType: "SERVICE_PACKAGE",
      field: "sessionCount",
      message: "Quantidade de sessões ausente ou inválida. Use o número de sessões.",
    };
  }

  const price = normalizeMoney(cellValue(row, context, "packagePrice"));
  if (price === null && cellValue(row, context, "packagePrice")) {
    return {
      status: "FAILED",
      entityType: "SERVICE_PACKAGE",
      field: "packagePrice",
      message: "Preço do pacote inválido. Use número, ex.: 300 ou 300,00.",
    };
  }

  const validityDays = normalizeInteger(cellValue(row, context, "validityDays"));
  if (validityDays === null && cellValue(row, context, "validityDays")) {
    return {
      status: "FAILED",
      entityType: "SERVICE_PACKAGE",
      field: "validityDays",
      message: "Validade inválida. Use o número de dias.",
    };
  }

  const existing = await tx.servicePackage.findFirst({
    where: {
      barbershopId,
      serviceId: service.value.id,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    return {
      status: "SKIPPED",
      entityType: "SERVICE_PACKAGE",
      entityId: existing.id,
      message: "Pacote já existe no catálogo (mesmo nome e serviço).",
    };
  }

  const created = await tx.servicePackage.create({
    data: {
      barbershopId,
      serviceId: service.value.id,
      name,
      sessionCount,
      price: price ?? 0,
      validityDays: validityDays && validityDays > 0 ? validityDays : null,
      active: true,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "SERVICE_PACKAGE",
    entityId: created.id,
    createdPackageId: created.id,
  };
}

/**
 * Saldo de pacotes dos clientes (`CLIENT_PACKAGES`).
 */
export async function importClientPackageRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<PackageImportResult> {
  const rawPhone = cellValue(row, context, "clientWhatsapp");
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      status: "FAILED",
      entityType: "CLIENT_PACKAGE",
      field: "clientWhatsapp",
      message: rawPhone
        ? "Telefone do cliente inválido. Use DDD + número (10 ou 11 dígitos)."
        : "Telefone do cliente ausente.",
    };
  }

  const rawPackage = cellValue(row, context, "packageName");
  if (!rawPackage) {
    return {
      status: "FAILED",
      entityType: "CLIENT_PACKAGE",
      field: "packageName",
      message: "Nome do pacote ausente.",
    };
  }

  const totalSessions = normalizeInteger(cellValue(row, context, "totalSessions"));
  if (totalSessions === null || totalSessions <= 0) {
    return {
      status: "FAILED",
      entityType: "CLIENT_PACKAGE",
      field: "totalSessions",
      message: "Quantidade de sessões ausente ou inválida.",
    };
  }

  const rawRemaining = cellValue(row, context, "remainingSessions");
  const remainingSessions = rawRemaining
    ? normalizeInteger(rawRemaining)
    : totalSessions;
  if (remainingSessions === null || remainingSessions < 0) {
    return {
      status: "FAILED",
      entityType: "CLIENT_PACKAGE",
      field: "remainingSessions",
      message: "Saldo de sessões inválido.",
    };
  }
  if (remainingSessions > totalSessions) {
    return {
      status: "FAILED",
      entityType: "CLIENT_PACKAGE",
      field: "remainingSessions",
      message: "O saldo de sessões não pode ser maior que o total de sessões.",
    };
  }

  const pricePaid = normalizeMoney(cellValue(row, context, "pricePaid"));
  if (pricePaid === null && cellValue(row, context, "pricePaid")) {
    return {
      status: "FAILED",
      entityType: "CLIENT_PACKAGE",
      field: "pricePaid",
      message: "Valor pago inválido. Use número, ex.: 300 ou 300,00.",
    };
  }

  const pkg = await lookupServicePackage(tx, barbershopId, rawPackage);
  if (pkg.status === "NOT_FOUND") {
    return {
      status: "FAILED",
      entityType: "CLIENT_PACKAGE",
      field: "packageName",
      message: `Pacote "${rawPackage}" não existe no catálogo. Importe o catálogo de pacotes antes do saldo dos clientes.`,
    };
  }
  if (pkg.status === "AMBIGUOUS") {
    return {
      status: "FAILED",
      entityType: "CLIENT_PACKAGE",
      field: "packageName",
      message: `O pacote "${rawPackage}" corresponde a ${pkg.count} pacotes do catálogo.`,
    };
  }

  const clientName = salonClientDisplayName(cellValue(row, context, "clientName"));
  let clientId: string | null = null;
  let createdClientId: string | null = null;
  const existingClient = await lookupClientByPhone(tx, barbershopId, phone);
  if (existingClient) {
    clientId = existingClient.id;
  } else {
    const created = await tx.salonClient.create({
      data: {
        barbershopId,
        name: clientName ?? "Cliente importado",
        whatsapp: phone,
        normalizedWhatsapp: phone,
        marketingOptIn: false,
        marketingOptInAt: null,
        marketingOptInSource: null,
      },
      select: { id: true },
    });
    clientId = created.id;
    createdClientId = created.id;
  }

  const purchasedAtRaw = normalizeDate(cellValue(row, context, "purchasedAt"));
  const purchasedAt = purchasedAtRaw ? new Date(`${purchasedAtRaw}T00:00:00.000Z`) : new Date();
  const expiresAtRaw = normalizeDate(cellValue(row, context, "expiresAt"));
  const expiresAt = expiresAtRaw ? new Date(`${expiresAtRaw}T00:00:00.000Z`) : null;

  const paymentMethod = resolvePackagePaymentMethod(cellValue(row, context, "paymentMethod"));

  // Saldo inicial: o `ClientPackage` nasce direto, sem ledger financeiro e
  // sem evento no ledger do CRM — importar saldo não é vender pacote.
  const created = await tx.clientPackage.create({
    data: {
      barbershopId,
      clientId,
      packageId: pkg.value.id,
      serviceId: pkg.value.serviceId,
      totalSessions,
      remainingSessions,
      pricePaid: pricePaid ?? 0,
      paymentMethod,
      status: remainingSessions > 0 ? "ACTIVE" : "DEPLETED",
      purchasedAt,
      expiresAt,
      soldById: null,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "CLIENT_PACKAGE",
    entityId: created.id,
    createdClientId,
  };
}

/** Forma de pagamento do pacote (o saldo importado não mexe no caixa). */
export function resolvePackagePaymentMethod(raw: string): "cash" | "pix" | "card" | "other" {
  const key = raw.trim().toLowerCase();
  if (!key) return "other";
  if (["dinheiro", "cash", "especie", "espéccie"].includes(key)) return "cash";
  if (["pix", "transferencia", "transferência"].includes(key)) return "pix";
  if (["cartao", "cartão", "credito", "crédito", "card", "debito", "débito"].includes(key)) return "card";
  return "other";
}
