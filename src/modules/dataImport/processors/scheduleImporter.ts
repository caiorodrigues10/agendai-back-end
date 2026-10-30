/**
 * Processador de linhas de horário.
 *
 * Dois alvos usam este arquivo:
 *   • `STAFF_SCHEDULES` — horário de cada profissional da equipe;
 *   • `SHOP_SCHEDULE`   — horário de funcionamento do estabelecimento.
 *
 * O sistema guarda **um único intervalo por dia** (`StaffSchedule` e
 * `Schedule` têm `@@unique([barbershopId, ..., dayOfWeek])`). Uma pausa de
 * almoço não cabe: quando a planilha traz "início/pausa/fim", o lote importa
 * o **intervalo mais amplo** (do primeiro início ao último fim) e avisa na
 * prévia que a pausa não foi representada — quem quiser o intervalo bloqueado
 * usa folgas/bloqueios.
 *
 * Regras:
 *   • dia já configurado **não** é sobrescrito por padrão (opção "substituir
 *     os dias da planilha" liga a substituição); quando substitui, o valor
 *     anterior fica guardado para o desfazer restaurar;
 *   • o dia importado é sempre do profissional que **já existe** na equipe —
 *     a importação nunca cria usuário com login.
 */
import { normalizeTime, normalizeWeekday } from "../utils/rowNormalization";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import { lookupStaff } from "./lookups";
import type { AppTx } from "@/libs/prismaClient";

export interface ScheduleImportResult extends ProcessedRow {
  /** Valor anterior do dia, quando a importação substituiu o que existia. */
  previousState?: Record<string, unknown> | null;
}

/** Resultado da leitura das colunas de horário de uma linha. */
interface ParsedSchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** Houve pausa na planilha? (o sistema não representa pausa) */
  hadPause: boolean;
}

/**
 * Lê as colunas de horário da linha.
 * Devolve `null` quando falta algo obrigatório — a mensagem fica com o
 * chamador, que conhece o contexto (aviso vs. erro).
 */
export function parseScheduleRow(
  row: Record<string, string>,
  context: ImportRowContext,
): { ok: true; value: ParsedSchedule } | { ok: false; message: string; field: "dayOfWeek" | "startTime" | "endTime" } {
  const rawDay = cellValue(row, context, "dayOfWeek");
  const dayOfWeek = normalizeWeekday(rawDay);
  if (dayOfWeek === null) {
    return {
      ok: false,
      field: "dayOfWeek",
      message: "Dia da semana ausente ou não reconhecido. Use o nome (segunda) ou o número (1 = segunda).",
    };
  }

  const startTime = normalizeTime(cellValue(row, context, "startTime"));
  if (!startTime) {
    return {
      ok: false,
      field: "startTime",
      message: "Horário de início ausente ou inválido. Use hh:mm.",
    };
  }

  const endTime = normalizeTime(cellValue(row, context, "endTime"));
  if (!endTime) {
    return {
      ok: false,
      field: "endTime",
      message: "Horário de término ausente ou inválido. Use hh:mm.",
    };
  }

  if (endTime <= startTime) {
    return {
      ok: false,
      field: "endTime",
      message: "O horário de término precisa ser depois do início.",
    };
  }

  const pauseStart = normalizeTime(cellValue(row, context, "pauseStart"));
  const pauseEnd = normalizeTime(cellValue(row, context, "pauseEnd"));
  const hadPause = Boolean(pauseStart || pauseEnd);

  return { ok: true, value: { dayOfWeek, startTime, endTime, hadPause } };
}

/** Aviso exibido quando a planilha traz pausa e o sistema não pode representá-la. */
export function schedulePauseWarning(parsed: ParsedSchedule): string {
  return `O sistema guarda um intervalo por dia: a pausa não foi importada e o horário ficou ${parsed.startTime}–${parsed.endTime}. Para bloquear o intervalo da pausa, use folgas/bloqueios.`;
}

/**
 * Horário dos profissionais (aba `STAFF_SCHEDULES`).
 *
 * O profissional é resolvido pelo nome: precisa existir na equipe. Nome
 * ambíguo (dois "João") rejeita a linha em vez de chutar.
 */
export async function importStaffScheduleRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<ScheduleImportResult> {
  const staffName = cellValue(row, context, "staffName");
  if (!staffName) {
    return {
      status: "FAILED",
      entityType: "STAFF_SCHEDULE",
      message: "Nome do profissional ausente.",
    };
  }

  const parsed = parseScheduleRow(row, context);
  if (!parsed.ok) {
    return {
      status: "FAILED",
      entityType: "STAFF_SCHEDULE",
      field: parsed.field,
      message: parsed.message,
    };
  }

  const staff = await lookupStaff(tx, barbershopId, staffName);
  if (staff.status === "NOT_FOUND") {
    return {
      status: "FAILED",
      entityType: "STAFF_SCHEDULE",
      field: "staffName",
      message: `Profissional "${staffName}" não existe na equipe deste salão. Cadastre a equipe antes de importar os horários.`,
    };
  }
  if (staff.status === "AMBIGUOUS") {
    return {
      status: "FAILED",
      entityType: "STAFF_SCHEDULE",
      field: "staffName",
      message: `O nome "${staffName}" corresponde a ${staff.count} profissionais da equipe. Use o nome completo na planilha para diferenciar.`,
    };
  }

  const existing = await tx.staffSchedule.findUnique({
    where: {
      barbershopId_staffId_dayOfWeek: {
        barbershopId,
        staffId: staff.value.id,
        dayOfWeek: parsed.value.dayOfWeek,
      },
    },
    select: { id: true, startTime: true, endTime: true, isActive: true },
  });

  const warnings = parsed.value.hadPause ? [schedulePauseWarning(parsed.value)] : [];

  if (existing && !context.options.replaceExistingSchedules) {
    return {
      status: "SKIPPED",
      entityType: "STAFF_SCHEDULE",
      entityId: existing.id,
      message: "Este dia já tem horário configurado. Ative \"substituir os dias da planilha\" para trocar.",
      warnings,
    };
  }

  if (existing) {
    const updated = await tx.staffSchedule.update({
      where: { id: existing.id },
      data: { startTime: parsed.value.startTime, endTime: parsed.value.endTime, isActive: true },
      select: { id: true },
    });
    return {
      status: "IMPORTED",
      entityType: "STAFF_SCHEDULE",
      entityId: updated.id,
      warnings,
      previousState: {
        before: {
          startTime: existing.startTime,
          endTime: existing.endTime,
          isActive: existing.isActive,
        },
        applied: {
          startTime: parsed.value.startTime,
          endTime: parsed.value.endTime,
          isActive: true,
        },
      },
    };
  }

  const created = await tx.staffSchedule.create({
    data: {
      barbershopId,
      staffId: staff.value.id,
      dayOfWeek: parsed.value.dayOfWeek,
      startTime: parsed.value.startTime,
      endTime: parsed.value.endTime,
      isActive: true,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "STAFF_SCHEDULE",
    entityId: created.id,
    warnings,
    previousState: null,
  };
}

/**
 * Horário do estabelecimento (aba `SHOP_SCHEDULE`).
 *
 * Uma linha por dia da semana. `isOpen` aceito como "não"/"fechado" deixa o
 * dia fechado; sem a coluna, o dia é importado como aberto.
 */
export async function importShopScheduleRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<ScheduleImportResult> {
  const parsed = parseScheduleRow(row, context);
  if (!parsed.ok) {
    return {
      status: "FAILED",
      entityType: "SHOP_SCHEDULE",
      field: parsed.field,
      message: parsed.message,
    };
  }

  const isOpen = parseIsOpen(cellValue(row, context, "isOpen"));

  const existing = await tx.schedule.findUnique({
    where: {
      barbershopId_dayOfWeek: { barbershopId, dayOfWeek: parsed.value.dayOfWeek },
    },
    select: { id: true, isOpen: true, openTime: true, closeTime: true },
  });

  const warnings = parsed.value.hadPause ? [schedulePauseWarning(parsed.value)] : [];

  if (existing && !context.options.replaceExistingSchedules) {
    return {
      status: "SKIPPED",
      entityType: "SHOP_SCHEDULE",
      entityId: existing.id,
      message: "Este dia já tem horário do estabelecimento configurado. Ative \"substituir os dias da planilha\" para trocar.",
      warnings,
    };
  }

  if (existing) {
    const updated = await tx.schedule.update({
      where: { id: existing.id },
      data: {
        isOpen,
        openTime: parsed.value.startTime,
        closeTime: parsed.value.endTime,
      },
      select: { id: true },
    });
    return {
      status: "IMPORTED",
      entityType: "SHOP_SCHEDULE",
      entityId: updated.id,
      warnings,
      previousState: {
        before: {
          isOpen: existing.isOpen,
          openTime: existing.openTime,
          closeTime: existing.closeTime,
        },
        applied: {
          isOpen,
          openTime: parsed.value.startTime,
          closeTime: parsed.value.endTime,
        },
      },
    };
  }

  const created = await tx.schedule.create({
    data: {
      barbershopId,
      dayOfWeek: parsed.value.dayOfWeek,
      isOpen,
      openTime: parsed.value.startTime,
      closeTime: parsed.value.endTime,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "SHOP_SCHEDULE",
    entityId: created.id,
    warnings,
    previousState: null,
  };
}

/** "não", "fechado", "false", "0" → dia fechado. Vazio → aberto. */
export function parseIsOpen(raw: string): boolean {
  const text = raw.trim().toLowerCase();
  if (!text) return true;
  return !["nao", "não", "fechado", "false", "0", "closed"].includes(text);
}
