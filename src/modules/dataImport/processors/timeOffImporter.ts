/**
 * Processador de linhas de folga/bloqueio.
 *
 * Regras:
 *   • o profissional precisa já existir na equipe — a importação nunca cria
 *     usuário com login;
 *   • `startAt`/`endAt` são datas puras (`@db.Date`): o fuso não muda o dia;
 *   • por padrão a folga entra **aprovada** (quem importa é o dono do
 *     estabelecimento); a opção "importar como pendente" deixa a aprovação
 *     para depois;
 *   • a mesma folga (mesmo profissional, mesmo intervalo) não entra duas
 *     vezes;
 *   • a folga **não cancela** agendamento: a agenda continua como está e a
 *     prévia avisa quantos agendamentos caem no período.
 */
import { normalizeDate } from "../utils/rowNormalization";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import { lookupStaff } from "./lookups";
import type { AppTx } from "@/libs/prismaClient";

export interface TimeOffImportResult extends ProcessedRow {
  /** Número de agendamentos que caem no período da folga. */
  appointmentsInPeriod?: number;
}

export async function importTimeOffRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<TimeOffImportResult> {
  const staffName = cellValue(row, context, "staffName");
  if (!staffName) {
    return {
      status: "FAILED",
      entityType: "TIME_OFF",
      field: "staffName",
      message: "Nome do profissional ausente.",
    };
  }

  const startDate = normalizeDate(cellValue(row, context, "startDate"));
  if (!startDate) {
    return {
      status: "FAILED",
      entityType: "TIME_OFF",
      field: "startDate",
      message: "Data inicial ausente ou em formato não reconhecido. Use dd/mm/aaaa.",
    };
  }

  const endDate = normalizeDate(cellValue(row, context, "endDate"));
  if (!endDate) {
    return {
      status: "FAILED",
      entityType: "TIME_OFF",
      field: "endDate",
      message: "Data final ausente ou em formato não reconhecido. Use dd/mm/aaaa.",
    };
  }

  if (endDate < startDate) {
    return {
      status: "FAILED",
      entityType: "TIME_OFF",
      field: "endDate",
      message: "A data final precisa ser igual ou depois da data inicial.",
    };
  }

  const staff = await lookupStaff(tx, barbershopId, staffName);
  if (staff.status === "NOT_FOUND") {
    return {
      status: "FAILED",
      entityType: "TIME_OFF",
      field: "staffName",
      message: `Profissional "${staffName}" não existe na equipe deste salão. Cadastre a equipe antes de importar as folgas.`,
    };
  }
  if (staff.status === "AMBIGUOUS") {
    return {
      status: "FAILED",
      entityType: "TIME_OFF",
      field: "staffName",
      message: `O nome "${staffName}" corresponde a ${staff.count} profissionais da equipe. Use o nome completo na planilha para diferenciar.`,
    };
  }

  const status = resolveTimeOffStatus(cellValue(row, context, "timeOffStatus"), context.options.importTimeOffAsPending);

  const startAt = new Date(`${startDate}T00:00:00.000Z`);
  const endAt = new Date(`${endDate}T00:00:00.000Z`);

  const existing = await tx.staffTimeOff.findFirst({
    where: {
      barbershopId,
      staffId: staff.value.id,
      startAt,
      endAt,
      status: { not: "CANCELED" },
    },
    select: { id: true },
  });

  if (existing) {
    return {
      status: "SKIPPED",
      entityType: "TIME_OFF",
      entityId: existing.id,
      message: "Este profissional já tem folga neste período.",
    };
  }

  const reason = cellValue(row, context, "timeOffReason").slice(0, 2000) || null;

  const created = await tx.staffTimeOff.create({
    data: {
      barbershopId,
      staffId: staff.value.id,
      startAt,
      endAt,
      reason,
      status,
      // Folga aprovada pela importação: o aprovador é quem fez o upload.
      approvedById: status === "APPROVED" ? context.actingUserId : null,
    },
    select: { id: true },
  });

  // A folga não cancela a agenda: a prévia avisa o dono do que fica marcado.
  const appointmentsInPeriod = await tx.appointment.count({
    where: {
      barbershopId,
      staffId: staff.value.id,
      date: { gte: startAt, lte: endAt },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
  });

  const warnings: string[] = [];
  if (appointmentsInPeriod > 0) {
    warnings.push(
      `${appointmentsInPeriod} agendamento(s) deste profissional ficam no período da folga: a importação não cancela agendamento.`,
    );
  }

  return {
    status: "IMPORTED",
    entityType: "TIME_OFF",
    entityId: created.id,
    warnings,
    appointmentsInPeriod,
  };
}

/** Situação da folga: coluna da planilha ou a opção do assistente. */
export function resolveTimeOffStatus(
  raw: string,
  importAsPending: boolean,
): "PENDING" | "APPROVED" {
  const text = raw.trim().toLowerCase();
  if (text) {
    if (["pendente", "pending", "aguarda", "aguardando"].includes(text)) return "PENDING";
    if (["aprovada", "aprovado", "approved", "confirmada", "confirmado"].includes(text)) return "APPROVED";
  }
  return importAsPending ? "PENDING" : "APPROVED";
}
