/**
 * Validação de linha (dry-run).
 *
 * É a mesma regra do processamento real, sem escrever nada: o dono vê antes
 * de confirmar quantas linhas entram, quantas são rejeitadas e por quê.
 */
import type { AppTx } from "@/libs/prismaClient";
import { salonClientDisplayName } from "@/modules/clients/utils/ensureSalonClient";
import type { RowValidationResult } from "../dataImport.types";
import { normalizeInteger, normalizeMoney, normalizePhone, normalizeDate, normalizeTime } from "./rowNormalization";
import { cellValue, type ImportRowContext } from "../processors/importRowContext";
import { findDuplicateAppointment } from "../processors/appointmentDuplicate";

/** Valida uma linha contra o alvo do lote. Não escreve nada. */
export async function validateRow(
  db: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  targetType: "CLIENTS" | "SERVICES" | "APPOINTMENTS",
  rowNumber: number,
): Promise<RowValidationResult> {
  if (targetType === "CLIENTS") return validateClientRow(row, context, rowNumber);
  if (targetType === "SERVICES") return validateServiceRow(row, context, rowNumber);
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
