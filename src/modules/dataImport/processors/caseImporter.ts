/**
 * Processador de linhas de processo (`CASES`).
 *
 * Regras que importam:
 *   • o cliente é identificado pelo WhatsApp; se ainda não existir, ele é
 *     criado (sem marketing, sem mensagem) e vinculado ao lote para o
 *     desfazer removê-lo;
 *   • o número do processo não é único no banco: a importação evita duplicar
 *     pelo número quando ele vem preenchido e, sem número, pelo apelido do
 *     caso dentro do mesmo cliente;
 *   • CNJ com dígito inválido só gera aviso — processos antigos e números
 *     fora do padrão continuam entrando;
 *   • advogado responsável é resolvido por nome; ausente ou ambíguo entra sem
 *     responsável, com aviso, em vez de rejeitar o processo;
 *   • o processo importado não lança caixa, receita, honorário nem comissão;
 *     `shareWithClient` nasce desligado por sigilo.
 */
import type { AppTx } from "@/libs/prismaClient";
import type { CasePriority, ClientCaseStatus } from "@prisma/client";
import { salonClientDisplayName } from "@/modules/clients/utils/ensureSalonClient";
import { checkCnjCheckDigit } from "@/shared/utils/cnj";
import { normalizeDate, normalizeMoney, normalizePhone } from "../utils/rowNormalization";
import { normalizeHeaderText } from "../utils/columnMapping";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import { lookupClientByPhone, lookupStaff } from "./lookups";

export interface CaseImportResult extends ProcessedRow {
  createdClientId?: string | null;
}

const CASE_STATUS_MAP: Record<string, ClientCaseStatus> = {
  lead: "LEAD",
  prospeccao: "LEAD",
  "prospecção": "LEAD",
  "em andamento": "ACTIVE",
  ativo: "ACTIVE",
  active: "ACTIVE",
  "aguardando cliente": "AWAITING_CLIENT",
  "aguardando documento": "AWAITING_CLIENT",
  "em juizo": "IN_COURT",
  "em juízo": "IN_COURT",
  judicial: "IN_COURT",
  "in court": "IN_COURT",
  suspenso: "SUSPENDED",
  suspended: "SUSPENDED",
  encerrado: "CLOSED",
  concluido: "CLOSED",
  "concluído": "CLOSED",
  fechado: "CLOSED",
  closed: "CLOSED",
  arquivado: "ARCHIVED",
  archived: "ARCHIVED",
};

const CASE_PRIORITY_MAP: Record<string, CasePriority> = {
  baixa: "LOW",
  low: "LOW",
  normal: "NORMAL",
  media: "NORMAL",
  média: "NORMAL",
  alta: "HIGH",
  high: "HIGH",
  urgente: "URGENT",
  urgent: "URGENT",
};

/** Situação do processo; texto desconhecido vira ACTIVE com aviso. */
export function parseCaseStatus(raw: string): { value: ClientCaseStatus; warning?: string } {
  const text = raw.trim();
  if (!text) return { value: "ACTIVE" };
  const mapped = CASE_STATUS_MAP[normalizeHeaderText(text)];
  if (mapped) return { value: mapped };
  return {
    value: "ACTIVE",
    warning: `Situação "${text}" não reconhecida; usando "Em andamento".`,
  };
}

/** Prioridade do processo; texto desconhecido vira NORMAL com aviso. */
export function parseCasePriority(raw: string): { value: CasePriority; warning?: string } {
  const text = raw.trim();
  if (!text) return { value: "NORMAL" };
  const mapped = CASE_PRIORITY_MAP[normalizeHeaderText(text)];
  if (mapped) return { value: mapped };
  return {
    value: "NORMAL",
    warning: `Prioridade "${text}" não reconhecida; usando "Normal".`,
  };
}

/** Aviso de CNJ inválido, sem bloquear a importação. */
export function caseNumberWarning(caseNumber: string): string | null {
  if (!caseNumber) return null;
  const result = checkCnjCheckDigit(caseNumber);
  if (result === "invalid") {
    return `O número "${caseNumber}" não tem dígito verificador CNJ válido. O processo entra assim mesmo.`;
  }
  return null;
}

/** Processo já existente: número quando houver; senão cliente + apelido. */
export async function findExistingCase(
  tx: AppTx,
  barbershopId: string,
  input: { caseNumber: string; clientId: string | null; nickname: string },
): Promise<{ id: string } | null> {
  if (input.caseNumber) {
    return tx.clientCase.findFirst({
      where: { barbershopId, caseNumber: input.caseNumber },
      select: { id: true },
    });
  }
  if (!input.clientId) return null;
  return tx.clientCase.findFirst({
    where: {
      barbershopId,
      clientId: input.clientId,
      nickname: { equals: input.nickname, mode: "insensitive" },
    },
    select: { id: true },
  });
}

/** Advogado responsável por nome; ausência/ambiguidade só gera aviso. */
export async function resolveCaseStaff(
  tx: AppTx,
  barbershopId: string,
  rawName: string,
): Promise<{ id: string | null; warning?: string }> {
  const name = rawName.trim();
  if (!name) return { id: null };
  const staff = await lookupStaff(tx, barbershopId, name);
  if (staff.status === "FOUND") return { id: staff.value.id };
  if (staff.status === "AMBIGUOUS") {
    return {
      id: null,
      warning: `O nome "${name}" corresponde a ${staff.count} profissionais; o processo entra sem responsável.`,
    };
  }
  return {
    id: null,
    warning: `Advogado "${name}" não encontrado na equipe; o processo entra sem responsável.`,
  };
}

/** Importa uma linha de processo. */
export async function importCaseRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<CaseImportResult> {
  const warnings: string[] = [];

  const clientName = salonClientDisplayName(cellValue(row, context, "clientName"));
  if (!clientName) {
    return {
      status: "FAILED",
      entityType: "CASE",
      field: "clientName",
      message: "Nome do cliente ausente ou muito curto.",
    };
  }

  const rawPhone = cellValue(row, context, "clientWhatsapp");
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      status: "FAILED",
      entityType: "CASE",
      field: "clientWhatsapp",
      message: rawPhone
        ? "Telefone do cliente inválido. Use DDD + número (10 ou 11 dígitos)."
        : "Telefone do cliente ausente.",
    };
  }

  const nickname = cellValue(row, context, "caseName").slice(0, 120);
  if (nickname.length < 2) {
    return {
      status: "FAILED",
      entityType: "CASE",
      field: "caseName",
      message: "Apelido do caso ausente ou muito curto.",
    };
  }

  const caseNumber = cellValue(row, context, "caseNumber").slice(0, 30);
  const cnjWarning = caseNumberWarning(caseNumber);
  if (cnjWarning) warnings.push(cnjWarning);

  const rawOpenedAt = cellValue(row, context, "openedAt");
  const openedAtIso = rawOpenedAt ? normalizeDate(rawOpenedAt) : null;
  if (rawOpenedAt && !openedAtIso) {
    return {
      status: "FAILED",
      entityType: "CASE",
      field: "openedAt",
      message: "Data de abertura inválida. Use dd/mm/aaaa.",
    };
  }

  const rawClaimed = cellValue(row, context, "claimedAmount");
  const claimedAmount = rawClaimed ? normalizeMoney(rawClaimed) : null;
  if (rawClaimed && claimedAmount === null) {
    return {
      status: "FAILED",
      entityType: "CASE",
      field: "claimedAmount",
      message: "Valor da causa inválido. Use número, ex.: 10000 ou 10000,00.",
    };
  }

  const rawAwarded = cellValue(row, context, "awardedAmount");
  const awardedAmount = rawAwarded ? normalizeMoney(rawAwarded) : null;
  if (rawAwarded && awardedAmount === null) {
    return {
      status: "FAILED",
      entityType: "CASE",
      field: "awardedAmount",
      message: "Valor obtido inválido. Use número, ex.: 10000 ou 10000,00.",
    };
  }

  const existingClient = await lookupClientByPhone(tx, barbershopId, phone);
  const duplicate = await findExistingCase(tx, barbershopId, {
    caseNumber,
    clientId: existingClient?.id ?? null,
    nickname,
  });
  if (duplicate) {
    return {
      status: "SKIPPED",
      entityType: "CASE",
      entityId: duplicate.id,
      field: caseNumber ? "caseNumber" : "caseName",
      message: caseNumber
        ? "Processo com este número já existe."
        : "Processo com este apelido já existe para o cliente.",
    };
  }

  let clientId = existingClient?.id ?? null;
  let createdClientId: string | null = null;
  if (!clientId) {
    const createdClient = await tx.salonClient.create({
      data: {
        barbershopId,
        name: clientName,
        whatsapp: phone,
        normalizedWhatsapp: phone,
        marketingOptIn: false,
        marketingOptInAt: null,
        marketingOptInSource: null,
      },
      select: { id: true },
    });
    clientId = createdClient.id;
    createdClientId = createdClient.id;
  }

  const status = parseCaseStatus(cellValue(row, context, "caseStatus"));
  if (status.warning) warnings.push(status.warning);
  const priority = parseCasePriority(cellValue(row, context, "casePriority"));
  if (priority.warning) warnings.push(priority.warning);

  const staff = await resolveCaseStaff(tx, barbershopId, cellValue(row, context, "staffName"));
  if (staff.warning) warnings.push(staff.warning);

  const openedAt = openedAtIso
    ? new Date(`${openedAtIso}T00:00:00.000Z`)
    : new Date();
  const closedAt =
    status.value === "CLOSED" || status.value === "ARCHIVED" ? new Date() : null;

  const created = await tx.clientCase.create({
    data: {
      barbershopId,
      clientId,
      nickname,
      caseNumber: caseNumber || null,
      practiceArea: cellValue(row, context, "practiceArea").slice(0, 80) || null,
      notes: cellValue(row, context, "notes").slice(0, 2000) || null,
      status: status.value,
      priority: priority.value,
      title: cellValue(row, context, "caseTitle").slice(0, 160) || null,
      courtName: cellValue(row, context, "courtName").slice(0, 120) || null,
      opponent: cellValue(row, context, "opponent").slice(0, 120) || null,
      claimedAmount,
      awardedAmount,
      responsibleStaffId: staff.id,
      openedAt,
      closedAt,
      shareWithClient: false,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "CASE",
    entityId: created.id,
    warnings,
    createdClientId,
  };
}
