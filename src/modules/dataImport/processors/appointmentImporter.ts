/**
 * Processador de linhas de agendamento.
 *
 * Regras que importam:
 *   • serviço inexistente no catálogo → linha rejeitada (o lote não inventa
 *     serviço; o dono cria antes ou importa os serviços antes);
 *   • profissional é resolvido por nome — se não houver correspondência
 *     inequívoca, o agendamento entra sem profissional (não é erro);
 *   • cliente é resolvido pelo telefone; se não existir, é criado e fica
 *     vinculado ao lote (para o desfazer removê-lo);
 *   • o agendamento nasce com `source = IMPORT`: lembrete de WhatsApp,
 *     convite de avaliação, NPS, comissão e lançamento financeiro não
 *     acontecem para o que veio de planilha;
 *   • `completedAt`/`finalPrice` só são gravados quando o dono liga a opção
 *     "contar valores no histórico financeiro" (desligada por padrão).
 */
import { salonClientDisplayName, salonClientWhatsappKey } from "@/modules/clients/utils/ensureSalonClient";
import {
  IMPORT_APPOINTMENT_STATUS,
  IMPORT_MODALITIES,
  IMPORT_PAYMENT_METHODS,
} from "../dataImport.constants";
import { normalizeDate, normalizeMoney, normalizeTime } from "../utils/rowNormalization";
import { normalizeHeaderText } from "../utils/columnMapping";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import { findDuplicateAppointment } from "./appointmentDuplicate";
import type { AppTx } from "@/libs/prismaClient";

export interface AppointmentImportResult extends ProcessedRow {
  createdClientId?: string | null;
  createdCaseId?: string | null;
}

export async function importAppointmentRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<AppointmentImportResult> {
  const isoDate = normalizeDate(cellValue(row, context, "date"));
  if (!isoDate) {
    return {
      status: "FAILED",
      entityType: "APPOINTMENT",
      message: "Data ausente ou em formato não reconhecido. Use dd/mm/aaaa.",
    };
  }

  const time = normalizeTime(cellValue(row, context, "time"));
  if (!time) {
    return {
      status: "FAILED",
      entityType: "APPOINTMENT",
      message: "Hora ausente ou em formato não reconhecido. Use hh:mm.",
    };
  }

  const serviceName = cellValue(row, context, "serviceName").slice(0, 100);
  if (!serviceName) {
    return {
      status: "FAILED",
      entityType: "APPOINTMENT",
      message: "Serviço do agendamento ausente.",
    };
  }

  const service = await tx.service.findFirst({
    where: {
      barbershopId,
      active: true,
      name: { equals: serviceName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!service) {
    return {
      status: "FAILED",
      entityType: "APPOINTMENT",
      message: `Serviço "${serviceName}" não existe no catálogo.`,
    };
  }

  const customerName = salonClientDisplayName(cellValue(row, context, "clientName")) ?? "Cliente importado";
  const rawPhone = cellValue(row, context, "clientWhatsapp");
  const phone = rawPhone ? salonClientWhatsappKey(rawPhone) : null;
  if (rawPhone && !phone) {
    return {
      status: "FAILED",
      entityType: "APPOINTMENT",
      message: "Telefone do cliente inválido. Use DDD + número.",
    };
  }

  let clientId: string | null = null;
  let createdClientId: string | null = null;
  if (phone) {
    const existing = await tx.salonClient.findFirst({
      where: { barbershopId, normalizedWhatsapp: phone },
      select: { id: true },
    });
    if (existing) {
      clientId = existing.id;
    } else {
      const created = await tx.salonClient.create({
        data: {
          barbershopId,
          name: customerName,
          whatsapp: phone,
          normalizedWhatsapp: phone,
          marketingOptIn: false,
        },
        select: { id: true },
      });
      clientId = created.id;
      createdClientId = created.id;
    }
  }

  const staff = await resolveStaff(tx, barbershopId, cellValue(row, context, "staffName"));

  const caseInfo = await resolveCase(tx, barbershopId, clientId, cellValue(row, context, "caseName"), cellValue(row, context, "practiceArea"), context);

  const status = resolveStatus(cellValue(row, context, "status"));
  const modality = resolveModality(cellValue(row, context, "modality"));
  const paymentMethod = resolvePaymentMethod(cellValue(row, context, "paymentMethod"));
  const finalPrice = normalizeMoney(cellValue(row, context, "finalPrice"));

  const appointmentDate = new Date(`${isoDate}T00:00:00.000Z`);

  // Reimportar o mesmo arquivo não duplica agenda: mesmo serviço, mesmo
  // cliente e mesmo horário é o mesmo agendamento.
  const duplicate = await findDuplicateAppointment(tx, barbershopId, {
    serviceId: service.id,
    clientId,
    phone,
    customerName,
    date: isoDate,
    time,
  });
  if (duplicate) {
    return {
      status: "SKIPPED",
      entityType: "APPOINTMENT",
      entityId: duplicate.id,
      message: "Agendamento já existe na agenda.",
    };
  }

  // "Contar valores no histórico financeiro" desligado (padrão): o agendamento
  // entra na agenda, mas não vira receita — `completedAt` e `finalPrice` ficam
  // vazios, então relatórios e comissões não o enxergam.
  const countsFinance = context.options.countFinancialValues;
  const completedAt = countsFinance && status === "COMPLETED" ? new Date(`${isoDate}T00:00:00.000Z`) : null;

  const created = await tx.appointment.create({
    data: {
      barbershopId,
      serviceId: service.id,
      staffId: staff,
      clientId,
      customerName,
      whatsapp: phone ?? "",
      date: appointmentDate,
      time,
      status,
      source: "IMPORT",
      modality,
      paymentMethod,
      caseId: caseInfo.caseId,
      caseName: caseInfo.caseName,
      practiceArea: caseInfo.practiceArea,
      finalPrice: countsFinance ? finalPrice : null,
      completedAt,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "APPOINTMENT",
    entityId: created.id,
    createdClientId,
    createdCaseId: caseInfo.createdCaseId,
  };
}

/**
 * Caso/processo do agendamento.
 *
 * Só existe em segmentos com perfil auxiliar `case` (escritório de
 * advocacia) e apenas quando o dono mapeou a coluna de forma explícita. O
 * caso nasce com `shareWithClient = false`: sigilo é o padrão — nada de
 * número de processo ou apelido interno sai do painel.
 */
async function resolveCase(
  tx: AppTx,
  barbershopId: string,
  clientId: string | null,
  rawNickname: string,
  rawPracticeArea: string,
  context: ImportRowContext,
): Promise<{ caseId: string | null; caseName: string | null; practiceArea: string | null; createdCaseId: string | null }> {
  const nickname = rawNickname.trim().slice(0, 120);
  const practiceArea = rawPracticeArea.trim().slice(0, 80) || null;

  if (!context.options.includeCase || !nickname || !clientId) {
    return { caseId: null, caseName: null, practiceArea: null, createdCaseId: null };
  }

  const existing = await tx.clientCase.findFirst({
    where: { barbershopId, clientId, nickname: { equals: nickname, mode: "insensitive" } },
    select: { id: true },
  });

  if (existing) {
    return { caseId: existing.id, caseName: nickname, practiceArea, createdCaseId: null };
  }

  const created = await tx.clientCase.create({
    data: {
      barbershopId,
      clientId,
      nickname,
      practiceArea,
      active: true,
      // Sigilo: caso importado nunca aparece no portal do cliente.
      shareWithClient: false,
    },
    select: { id: true },
  });

  return { caseId: created.id, caseName: nickname, practiceArea, createdCaseId: created.id };
}

/** Situação do agendamento vinda da planilha (padrão: confirmado). */
export function resolveStatus(raw: string): "CONFIRMED" | "CANCELLED" | "COMPLETED" | "CHECKED_IN" | "NO_SHOW" {
  if (!raw) return "CONFIRMED";
  const key = normalizeHeaderText(raw);
  const mapped = IMPORT_APPOINTMENT_STATUS[key];
  if (!mapped) return "CONFIRMED";
  return mapped as "CONFIRMED" | "CANCELLED" | "COMPLETED" | "CHECKED_IN" | "NO_SHOW";
}

/** Forma de pagamento (texto livre quando não reconhecida). */
export function resolvePaymentMethod(raw: string): string | null {
  if (!raw) return null;
  const key = normalizeHeaderText(raw);
  return IMPORT_PAYMENT_METHODS[key] ?? raw.slice(0, 50);
}

/** Modalidade do atendimento (padrão: presencial). */
export function resolveModality(raw: string): "IN_PERSON" | "VIDEO" | "PHONE" {
  if (!raw) return "IN_PERSON";
  const key = normalizeHeaderText(raw);
  const mapped = IMPORT_MODALITIES[key];
  return (mapped as "IN_PERSON" | "VIDEO" | "PHONE") ?? "IN_PERSON";
}

/**
 * Profissional por nome: casamento exato (ignorando acentos e caixa) e, se
 * houver mais de um, o lote não escolhe — o agendamento entra sem
 * profissional.
 */
async function resolveStaff(
  tx: AppTx,
  barbershopId: string,
  rawName: string,
): Promise<string | null> {
  const name = rawName.trim();
  if (!name) return null;

  const exact = await tx.user.findMany({
    where: {
      barbershopId,
      active: true,
      deletedAt: null,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
    take: 2,
  });
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;

  const key = normalizeHeaderText(name);
  const candidates = await tx.user.findMany({
    where: {
      barbershopId,
      active: true,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });

  const normalized = candidates.filter((candidate) => {
    const candidateKey = normalizeHeaderText(candidate.name);
    return candidateKey === key || candidateKey.startsWith(`${key} `) || key.startsWith(`${candidateKey} `);
  });

  return normalized.length === 1 ? normalized[0].id : null;
}
