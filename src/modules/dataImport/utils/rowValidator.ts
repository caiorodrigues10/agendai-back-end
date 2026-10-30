/**
 * Validação de linha (dry-run).
 *
 * É a mesma regra do processamento real, sem escrever nada: o dono vê antes
 * de confirmar quantas linhas entram, quantas são rejeitadas e por quê.
 *
 * As funções reaproveitam as mesmas regras de leitura dos processadores
 * (`parseScheduleRow`, `resolveTimeOffStatus`, `resolveUnit`...) — assim a
 * prévia e a importação não divergem.
 */
import type { AppTx } from "@/libs/prismaClient";
import { salonClientDisplayName } from "@/modules/clients/utils/ensureSalonClient";
import type { ImportTargetType, RowValidationResult } from "../dataImport.types";
import {
  normalizeInteger,
  normalizeMoney,
  normalizePhone,
  normalizeDate,
  normalizeTime,
  normalizeQuantity,
} from "./rowNormalization";
import { cellValue, type ImportRowContext } from "../processors/importRowContext";
import { findDuplicateAppointment } from "../processors/appointmentDuplicate";
import {
  parseScheduleRow,
  schedulePauseWarning,
} from "../processors/scheduleImporter";
import { resolveTimeOffStatus } from "../processors/timeOffImporter";
import { resolveUnit, resolveProductType } from "../processors/productImporter";
import { resolvePackagePaymentMethod } from "../processors/packageImporter";
import { lookupStaff, lookupService, lookupServicePackage } from "../processors/lookups";
import { normalizeHeaderText } from "./columnMapping";

/** Valida uma linha contra o alvo do lote. Não escreve nada. */
export async function validateRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  targetType: ImportTargetType,
  rowNumber: number,
): Promise<RowValidationResult> {
  if (targetType === "CLIENTS") return validateClientRow(row, context, rowNumber);
  if (targetType === "SERVICES") return validateServiceRow(row, context, rowNumber);
  if (targetType === "STAFF_SCHEDULES") {
    return validateStaffScheduleRow(db, barbershopId, row, context, rowNumber);
  }
  if (targetType === "SHOP_SCHEDULE") return validateShopScheduleRow(row, context, rowNumber);
  if (targetType === "TIME_OFF") {
    return validateTimeOffRow(db, barbershopId, row, context, rowNumber);
  }
  if (targetType === "PRODUCTS") {
    return validateProductRow(db, barbershopId, row, context, rowNumber);
  }
  if (targetType === "SERVICE_PACKAGES") {
    return validateServicePackageRow(db, barbershopId, row, context, rowNumber);
  }
  if (targetType === "CLIENT_PACKAGES") {
    return validateClientPackageRow(db, barbershopId, row, context, rowNumber);
  }
  if (targetType === "FIADOS") {
    return validateFiadoRow(db, barbershopId, row, context, rowNumber);
  }
  return validateAppointmentRow(db, barbershopId, row, context, rowNumber);
}

function validateClientRow(
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): RowValidationResult {
  const name = salonClientDisplayName(cellValue(row, context, "name"));
  if (!name) {
    return { rowNumber, status: "FAILED", field: "name", message: "Nome do cliente ausente ou muito curto." };
  }
  const rawPhone = cellValue(row, context, "whatsapp");
  if (!rawPhone) {
    return { rowNumber, status: "FAILED", field: "whatsapp", message: "Telefone do cliente ausente." };
  }
  if (!normalizePhone(rawPhone)) {
    return {
      rowNumber,
      status: "FAILED",
      field: "whatsapp",
      message: "Telefone inválido. Use DDD + número (10 ou 11 dígitos).",
    };
  }
  return { rowNumber, status: "VALID" };
}

function validateServiceRow(
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): RowValidationResult {
  const name = cellValue(row, context, "serviceName");
  if (name.length < 2) {
    return {
      rowNumber,
      status: "FAILED",
      field: "serviceName",
      message: "Nome do serviço ausente ou muito curto.",
    };
  }
  const rawPrice = cellValue(row, context, "price");
  if (rawPrice && normalizeMoney(rawPrice) === null) {
    return { rowNumber, status: "FAILED", field: "price", message: "Preço inválido. Use número, ex.: 50 ou 50,00." };
  }
  const rawDuration = cellValue(row, context, "durationMinutes");
  if (rawDuration && normalizeInteger(rawDuration) === null) {
    return {
      rowNumber,
      status: "FAILED",
      field: "durationMinutes",
      message: "Duração inválida. Use o número de minutos.",
    };
  }
  return { rowNumber, status: "VALID" };
}

async function validateAppointmentRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  if (!normalizeDate(cellValue(row, context, "date"))) {
    return {
      rowNumber,
      status: "FAILED",
      field: "date",
      message: "Data ausente ou em formato não reconhecido. Use dd/mm/aaaa.",
    };
  }
  if (!normalizeTime(cellValue(row, context, "time"))) {
    return {
      rowNumber,
      status: "FAILED",
      field: "time",
      message: "Hora ausente ou em formato não reconhecido. Use hh:mm.",
    };
  }

  const serviceName = cellValue(row, context, "serviceName");
  if (!serviceName) {
    return { rowNumber, status: "FAILED", field: "serviceName", message: "Serviço do agendamento ausente." };
  }
  const service = await db.service.findFirst({
    where: {
      barbershopId,
      active: true,
      name: { equals: serviceName.slice(0, 100), mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!service) {
    return {
      rowNumber,
      status: "FAILED",
      field: "serviceName",
      message: `Serviço "${serviceName}" não existe no catálogo.`,
    };
  }

  const rawPhone = cellValue(row, context, "clientWhatsapp");
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) {
    return {
      rowNumber,
      status: "FAILED",
      field: "clientWhatsapp",
      message: "Telefone do cliente inválido. Use DDD + número.",
    };
  }

  // Reimportar o mesmo arquivo não duplica agenda: a linha aparece como
  // "ignorada" na prévia, e não como "entra".
  const isoDate = normalizeDate(cellValue(row, context, "date"))!;
  const time = normalizeTime(cellValue(row, context, "time"))!;
  const clientId = phone
    ? (
        await db.salonClient.findFirst({
          where: { barbershopId, normalizedWhatsapp: phone },
          select: { id: true },
        })
      )?.id ?? null
    : null;
  const duplicate = await findDuplicateAppointment(db, barbershopId, {
    serviceId: service.id,
    clientId,
    phone,
    customerName: salonClientDisplayName(cellValue(row, context, "clientName")) ?? "Cliente importado",
    date: isoDate,
    time,
  });
  if (duplicate) {
    return {
      rowNumber,
      status: "SKIPPED",
      field: "date",
      message: "Agendamento já existe na agenda.",
    };
  }

  return { rowNumber, status: "VALID" };
}

/**
 * Horário da equipe (`STAFF_SCHEDULES`).
 *
 * O profissional precisa existir na equipe e o dia já configurado aparece
 * como "ignorado" (a substituição é opt-in).
 */
async function validateStaffScheduleRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  const staffName = cellValue(row, context, "staffName");
  if (!staffName) {
    return {
      rowNumber,
      status: "FAILED",
      field: "staffName",
      message: "Nome do profissional ausente.",
    };
  }

  const parsed = parseScheduleRow(row, context);
  if (!parsed.ok) {
    return { rowNumber, status: "FAILED", field: parsed.field, message: parsed.message };
  }

  const staff = await lookupStaff(db, barbershopId, staffName);
  if (staff.status === "NOT_FOUND") {
    return {
      rowNumber,
      status: "FAILED",
      field: "staffName",
      message: `Profissional "${staffName}" não existe na equipe deste salão. Cadastre a equipe antes de importar os horários.`,
    };
  }
  if (staff.status === "AMBIGUOUS") {
    return {
      rowNumber,
      status: "FAILED",
      field: "staffName",
      message: `O nome "${staffName}" corresponde a ${staff.count} profissionais da equipe. Use o nome completo na planilha para diferenciar.`,
    };
  }

  const warnings = parsed.value.hadPause ? [schedulePauseWarning(parsed.value)] : [];

  const existing = await db.staffSchedule.findUnique({
    where: {
      barbershopId_staffId_dayOfWeek: {
        barbershopId,
        staffId: staff.value.id,
        dayOfWeek: parsed.value.dayOfWeek,
      },
    },
    select: { id: true },
  });

  if (existing && !context.options.replaceExistingSchedules) {
    return {
      rowNumber,
      status: "SKIPPED",
      field: "dayOfWeek",
      message: "Este dia já tem horário configurado. Ative \"substituir os dias da planilha\" para trocar.",
      warnings,
    };
  }

  return { rowNumber, status: "VALID", warnings };
}

/** Horário do estabelecimento (`SHOP_SCHEDULE`). */
async function validateShopScheduleRow(
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  const parsed = parseScheduleRow(row, context);
  if (!parsed.ok) {
    return { rowNumber, status: "FAILED", field: parsed.field, message: parsed.message };
  }

  const warnings = parsed.value.hadPause ? [schedulePauseWarning(parsed.value)] : [];
  return { rowNumber, status: "VALID", warnings };
}

/** Folgas e bloqueios (`TIME_OFF`). */
async function validateTimeOffRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  const staffName = cellValue(row, context, "staffName");
  if (!staffName) {
    return {
      rowNumber,
      status: "FAILED",
      field: "staffName",
      message: "Nome do profissional ausente.",
    };
  }

  const startDate = normalizeDate(cellValue(row, context, "startDate"));
  if (!startDate) {
    return {
      rowNumber,
      status: "FAILED",
      field: "startDate",
      message: "Data inicial ausente ou em formato não reconhecido. Use dd/mm/aaaa.",
    };
  }

  const endDate = normalizeDate(cellValue(row, context, "endDate"));
  if (!endDate) {
    return {
      rowNumber,
      status: "FAILED",
      field: "endDate",
      message: "Data final ausente ou em formato não reconhecido. Use dd/mm/aaaa.",
    };
  }

  if (endDate < startDate) {
    return {
      rowNumber,
      status: "FAILED",
      field: "endDate",
      message: "A data final precisa ser igual ou depois da data inicial.",
    };
  }

  const staff = await lookupStaff(db, barbershopId, staffName);
  if (staff.status === "NOT_FOUND") {
    return {
      rowNumber,
      status: "FAILED",
      field: "staffName",
      message: `Profissional "${staffName}" não existe na equipe deste salão. Cadastre a equipe antes de importar as folgas.`,
    };
  }
  if (staff.status === "AMBIGUOUS") {
    return {
      rowNumber,
      status: "FAILED",
      field: "staffName",
      message: `O nome "${staffName}" corresponde a ${staff.count} profissionais da equipe. Use o nome completo na planilha para diferenciar.`,
    };
  }

  const existing = await db.staffTimeOff.findFirst({
    where: {
      barbershopId,
      staffId: staff.value.id,
      startAt: new Date(`${startDate}T00:00:00.000Z`),
      endAt: new Date(`${endDate}T00:00:00.000Z`),
      status: { not: "CANCELED" },
    },
    select: { id: true },
  });

  if (existing) {
    return {
      rowNumber,
      status: "SKIPPED",
      field: "startDate",
      message: "Este profissional já tem folga neste período.",
    };
  }

  const status = resolveTimeOffStatus(
    cellValue(row, context, "timeOffStatus"),
    context.options.importTimeOffAsPending,
  );

  const appointmentsInPeriod = await db.appointment.count({
    where: {
      barbershopId,
      staffId: staff.value.id,
      date: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
  });

  const warnings: string[] = [];
  if (appointmentsInPeriod > 0) {
    warnings.push(
      `${appointmentsInPeriod} agendamento(s) deste profissional ficam no período da folga: a importação não cancela agendamento.`,
    );
  }
  if (status === "PENDING") {
    warnings.push("A folga entra como pendente de aprovação.");
  }

  return { rowNumber, status: "VALID", warnings };
}

/** Produtos e estoque inicial (`PRODUCTS`). */
async function validateProductRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  const name = cellValue(row, context, "productName").slice(0, 160);
  if (name.length < 2) {
    return {
      rowNumber,
      status: "FAILED",
      field: "productName",
      message: "Nome do produto ausente ou muito curto.",
    };
  }

  const salePrice = normalizeMoney(cellValue(row, context, "salePrice"));
  if (salePrice === null && cellValue(row, context, "salePrice")) {
    return {
      rowNumber,
      status: "FAILED",
      field: "salePrice",
      message: "Preço de venda inválido. Use número, ex.: 50 ou 50,00.",
    };
  }

  const costPrice = normalizeMoney(cellValue(row, context, "costPrice"));
  if (costPrice === null && cellValue(row, context, "costPrice")) {
    return {
      rowNumber,
      status: "FAILED",
      field: "costPrice",
      message: "Custo inválido. Use número, ex.: 20 ou 20,00.",
    };
  }

  const stockQty = normalizeQuantity(cellValue(row, context, "stockQty"));
  if (stockQty === null && cellValue(row, context, "stockQty")) {
    return {
      rowNumber,
      status: "FAILED",
      field: "stockQty",
      message: "Saldo inicial inválido. Use número, ex.: 10 ou 10,5.",
    };
  }

  const minStock = normalizeQuantity(cellValue(row, context, "minStock"));
  if (minStock === null && cellValue(row, context, "minStock")) {
    return {
      rowNumber,
      status: "FAILED",
      field: "minStock",
      message: "Estoque mínimo inválido. Use número, ex.: 2.",
    };
  }

  const warnings: string[] = [];
  if (cellValue(row, context, "productImage")) {
    warnings.push("A coluna de imagem foi ignorada: a importação não baixa imagem de produto.");
  }

  const sku = cellValue(row, context, "productSku").slice(0, 60) || null;
  const barcode = cellValue(row, context, "productBarcode").slice(0, 80) || null;

  let existing: { id: string } | null = null;
  if (sku) {
    existing = await db.product.findFirst({
      where: { barbershopId, sku },
      select: { id: true },
    });
  }
  if (!existing && barcode) {
    existing = await db.product.findFirst({
      where: { barbershopId, barcode },
      select: { id: true },
    });
  }
  if (!existing) {
    const key = normalizeHeaderText(name);
    const candidates = await db.product.findMany({
      where: { barbershopId },
      select: { id: true, name: true },
      take: 50,
    });
    existing =
      candidates.find((candidate) => normalizeHeaderText(candidate.name) === key) ?? null;
  }

  if (existing && !context.options.updateExistingProducts) {
    return {
      rowNumber,
      status: "SKIPPED",
      field: "productName",
      message: "Produto já existe no catálogo (mesmo SKU, código de barras ou nome).",
      warnings,
    };
  }

  const categoryName = cellValue(row, context, "productCategory").trim();
  if (categoryName && !context.options.createProductCategories) {
    const categories = await db.productCategory.findMany({
      where: { barbershopId },
      select: { id: true, name: true },
    });
    const key = normalizeHeaderText(categoryName);
    const found = categories.some(
      (category) => normalizeHeaderText(category.name) === key,
    );
    if (!found) {
      warnings.push(
        `Categoria "${categoryName}" não existe e não foi criada (opção desligada): o produto entra sem categoria.`,
      );
    }
  }

  if (stockQty && stockQty > 0) {
    warnings.push(
      "O saldo inicial entra como movimento de estoque: não é compra e não gera despesa nem caixa.",
    );
  }

  return { rowNumber, status: "VALID", warnings };
}

/** Catálogo de pacotes (`SERVICE_PACKAGES`). */
async function validateServicePackageRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  const name = cellValue(row, context, "packageName").slice(0, 100);
  if (name.length < 2) {
    return {
      rowNumber,
      status: "FAILED",
      field: "packageName",
      message: "Nome do pacote ausente ou muito curto.",
    };
  }

  const rawService = cellValue(row, context, "serviceName");
  if (!rawService) {
    return {
      rowNumber,
      status: "FAILED",
      field: "serviceName",
      message: "Serviço do pacote ausente.",
    };
  }

  const service = await lookupService(db, barbershopId, rawService);
  if (service.status === "NOT_FOUND") {
    return {
      rowNumber,
      status: "FAILED",
      field: "serviceName",
      message: `Serviço "${rawService}" não existe no catálogo. Importe os serviços antes dos pacotes.`,
    };
  }
  if (service.status === "AMBIGUOUS") {
    return {
      rowNumber,
      status: "FAILED",
      field: "serviceName",
      message: `O serviço "${rawService}" corresponde a ${service.count} cadastros no catálogo.`,
    };
  }

  const sessionCount = normalizeInteger(cellValue(row, context, "sessionCount"));
  if (sessionCount === null || sessionCount <= 0) {
    return {
      rowNumber,
      status: "FAILED",
      field: "sessionCount",
      message: "Quantidade de sessões ausente ou inválida. Use o número de sessões.",
    };
  }

  const price = normalizeMoney(cellValue(row, context, "packagePrice"));
  if (price === null && cellValue(row, context, "packagePrice")) {
    return {
      rowNumber,
      status: "FAILED",
      field: "packagePrice",
      message: "Preço do pacote inválido. Use número, ex.: 300 ou 300,00.",
    };
  }

  const validityDays = normalizeInteger(cellValue(row, context, "validityDays"));
  if (validityDays === null && cellValue(row, context, "validityDays")) {
    return {
      rowNumber,
      status: "FAILED",
      field: "validityDays",
      message: "Validade inválida. Use o número de dias.",
    };
  }

  const existing = await db.servicePackage.findFirst({
    where: {
      barbershopId,
      serviceId: service.value.id,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    return {
      rowNumber,
      status: "SKIPPED",
      field: "packageName",
      message: "Pacote já existe no catálogo (mesmo nome e serviço).",
    };
  }

  return { rowNumber, status: "VALID" };
}

/** Saldo de pacotes dos clientes (`CLIENT_PACKAGES`). */
async function validateClientPackageRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  const rawPhone = cellValue(row, context, "clientWhatsapp");
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      rowNumber,
      status: "FAILED",
      field: "clientWhatsapp",
      message: rawPhone
        ? "Telefone do cliente inválido. Use DDD + número (10 ou 11 dígitos)."
        : "Telefone do cliente ausente.",
    };
  }

  const rawPackage = cellValue(row, context, "packageName");
  if (!rawPackage) {
    return {
      rowNumber,
      status: "FAILED",
      field: "packageName",
      message: "Nome do pacote ausente.",
    };
  }

  const totalSessions = normalizeInteger(cellValue(row, context, "totalSessions"));
  if (totalSessions === null || totalSessions <= 0) {
    return {
      rowNumber,
      status: "FAILED",
      field: "totalSessions",
      message: "Quantidade de sessões ausente ou inválida.",
    };
  }

  const rawRemaining = cellValue(row, context, "remainingSessions");
  const remainingSessions = rawRemaining ? normalizeInteger(rawRemaining) : totalSessions;
  if (remainingSessions === null || remainingSessions < 0) {
    return {
      rowNumber,
      status: "FAILED",
      field: "remainingSessions",
      message: "Saldo de sessões inválido.",
    };
  }
  if (remainingSessions > totalSessions) {
    return {
      rowNumber,
      status: "FAILED",
      field: "remainingSessions",
      message: "O saldo de sessões não pode ser maior que o total de sessões.",
    };
  }

  const pricePaid = normalizeMoney(cellValue(row, context, "pricePaid"));
  if (pricePaid === null && cellValue(row, context, "pricePaid")) {
    return {
      rowNumber,
      status: "FAILED",
      field: "pricePaid",
      message: "Valor pago inválido. Use número, ex.: 300 ou 300,00.",
    };
  }

  const pkg = await lookupServicePackage(db, barbershopId, rawPackage);
  if (pkg.status === "NOT_FOUND") {
    return {
      rowNumber,
      status: "FAILED",
      field: "packageName",
      message: `Pacote "${rawPackage}" não existe no catálogo. Importe o catálogo de pacotes antes do saldo dos clientes.`,
    };
  }
  if (pkg.status === "AMBIGUOUS") {
    return {
      rowNumber,
      status: "FAILED",
      field: "packageName",
      message: `O pacote "${rawPackage}" corresponde a ${pkg.count} pacotes do catálogo.`,
    };
  }

  const warnings: string[] = [];
  const client = await db.salonClient.findFirst({
    where: { barbershopId, normalizedWhatsapp: phone },
    select: { id: true },
  });
  if (!client) {
    warnings.push("O cliente ainda não existe: ele será criado junto com o saldo do pacote.");
  }
  if (pricePaid && pricePaid > 0) {
    warnings.push(
      "O valor pago entra como saldo do pacote: não gera receita nem lançamento no caixa.",
    );
  }

  return { rowNumber, status: "VALID", warnings };
}

/** Fiado (`FIADOS`). */
async function validateFiadoRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  rowNumber: number,
): Promise<RowValidationResult> {
  const customerName = salonClientDisplayName(cellValue(row, context, "customerName"));
  if (!customerName) {
    return {
      rowNumber,
      status: "FAILED",
      field: "customerName",
      message: "Nome de quem deve ausente ou muito curto.",
    };
  }

  const rawPhone = cellValue(row, context, "whatsapp");
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      rowNumber,
      status: "FAILED",
      field: "whatsapp",
      message: rawPhone
        ? "Telefone inválido. Use DDD + número (10 ou 11 dígitos)."
        : "Telefone de quem deve ausente.",
    };
  }

  const description = cellValue(row, context, "fiadoDescription").slice(0, 500);
  if (description.length < 2) {
    return {
      rowNumber,
      status: "FAILED",
      field: "fiadoDescription",
      message: "Descrição da dívida ausente ou muito curta.",
    };
  }

  const originalAmount = normalizeMoney(cellValue(row, context, "originalAmount"));
  if (originalAmount === null || originalAmount <= 0) {
    return {
      rowNumber,
      status: "FAILED",
      field: "originalAmount",
      message: "Valor da dívida ausente ou inválido. Use número maior que zero.",
    };
  }

  const rawPaid = cellValue(row, context, "paidAmount");
  const paidAmount = rawPaid ? normalizeMoney(rawPaid) : 0;
  if (paidAmount === null) {
    return {
      rowNumber,
      status: "FAILED",
      field: "paidAmount",
      message: "Valor já pago inválido. Use número, ex.: 50 ou 50,00.",
    };
  }
  if (paidAmount > originalAmount) {
    return {
      rowNumber,
      status: "FAILED",
      field: "paidAmount",
      message: "O valor já pago não pode ser maior que o valor da dívida.",
    };
  }

  const warnings: string[] = [];
  const client = await db.salonClient.findFirst({
    where: { barbershopId, normalizedWhatsapp: phone },
    select: { id: true },
  });
  if (!client) {
    warnings.push(
      "O telefone informado não bate com nenhum cliente do CRM: a dívida ficará sem vínculo com a ficha do cliente.",
    );
  }
  if (paidAmount > 0) {
    warnings.push(
      "O valor já pago fica como histórico da dívida: não entra no caixa nem no histórico financeiro.",
    );
  }
  warnings.push("A dívida importada não entra no primeiro ciclo de cobrança.");

  return { rowNumber, status: "VALID", warnings };
}
