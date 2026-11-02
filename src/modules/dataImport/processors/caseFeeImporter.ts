/**
 * Processador de linhas de honorário de êxito (`CASE_FEES`).
 *
 * Regras que importam:
 *   • o processo é identificado pelo número CNJ; se não houver número, é
 *     buscado pelo apelido do caso dentro do mesmo cliente (identificado pelo
 *     WhatsApp);
 *   • o cliente é criado se ainda não existir (sem marketing, sem mensagem);
 *   • o percentual é obrigatório (0–100); o valor é sempre **derivado** do
 *     `awardedAmount` do caso — nunca digitado diretamente na importação;
 *   • na importação só é aceito **1 parcela** (`installments > 1` é rejeitado;
 *     parcelas reais dependem do advogado e são criadas manualmente);
 *   • `CANCELED` é terminal; transições inválidas são recusadas;
 *   • o honorário importado não lança caixa, receita, lucro nem comissão;
 *     `shareWithClient` não se aplica (dados internos do escritório);
 *   • auditoria registra ids, status e campos alterados — nunca apelido,
 *     número do processo nem valores.
 */
import type { AppTx } from "@/libs/prismaClient";
import type { SuccessFeeStatus } from "@prisma/client";
import { salonClientDisplayName } from "@/modules/clients/utils/ensureSalonClient";
import { normalizeDate, normalizeInteger, normalizeMoney, normalizePhone } from "../utils/rowNormalization";
import { normalizeHeaderText } from "../utils/columnMapping";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import { lookupClientByPhone, lookupStaff } from "./lookups";

export interface CaseFeeImportResult extends ProcessedRow {
  createdClientId?: string | null;
}

const FEE_STATUS_MAP: Record<string, SuccessFeeStatus> = {
  pendente: "PENDING",
  pending: "PENDING",
  faturado: "INVOICED",
  invoiced: "INVOICED",
  pago: "PAID",
  paid: "PAID",
  cancelado: "CANCELED",
  canceled: "CANCELED",
};

/** Situação do honorário; texto desconhecido vira PENDING com aviso. */
export function parseFeeStatus(raw: string): { value: SuccessFeeStatus; warning?: string } {
  const text = raw.trim();
  if (!text) return { value: "PENDING" };
  const mapped = FEE_STATUS_MAP[normalizeHeaderText(text)];
  if (mapped) return { value: mapped };
  return {
    value: "PENDING",
    warning: `Situação "${text}" não reconhecida; usando "Pendente".`,
  };
}

/** Aviso quando o número de parcelas não é 1 na importação. */
export function feeInstallmentsWarning(raw: string): { value: number; warning?: string } | null {
  const parsed = normalizeInteger(raw);
  if (parsed === null) return null;
  if (parsed <= 0) return null;
  if (parsed === 1) return { value: 1 };
  return {
    value: 1,
    warning: `Parcelas "${parsed}" não são aceitas na importação; o honorário entra com 1 parcela.`,
  };
}

/** Importa uma linha de honorário de êxito. */
export async function importCaseFeeRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<CaseFeeImportResult> {
  const warnings: string[] = [];

  const caseNumber = cellValue(row, context, "caseNumber").slice(0, 30);
  const caseName = cellValue(row, context, "caseName").slice(0, 120);

  // Localizar o caso: número CNJ primeiro; senão apelido + cliente.
  let targetCaseId: string | null = null;
  let clientId: string | null = null;
  let createdClientId: string | null = null;

  if (caseNumber) {
    const found = await tx.clientCase.findFirst({
      where: { barbershopId, caseNumber },
      select: { id: true, clientId: true },
    });
    if (!found) {
      return {
        status: "FAILED",
        entityType: "CASE_FEE",
        field: "caseNumber",
        message: `Processo com número "${caseNumber}" não encontrado. Importe o processo antes do honorário.`,
      };
    }
    targetCaseId = found.id;
    clientId = found.clientId;
  } else if (caseName) {
    // Sem número: precisa do cliente para identificar o caso pelo apelido.
    const rawPhone = cellValue(row, context, "clientWhatsapp");
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return {
        status: "FAILED",
        entityType: "CASE_FEE",
        field: "clientWhatsapp",
        message: rawPhone
          ? "Telefone do cliente inválido. Use DDD + número (10 ou 11 dígitos)."
          : "Telefone do cliente é obrigatório quando não há número do processo.",
      };
    }
    const existingClient = await lookupClientByPhone(tx, barbershopId, phone);
    if (!existingClient) {
      const createdClient = await tx.salonClient.create({
        data: {
          barbershopId,
          name: salonClientDisplayName(cellValue(row, context, "clientName")) ?? "Cliente importado",
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
    } else {
      clientId = existingClient.id;
    }

    const foundCase = await tx.clientCase.findFirst({
      where: {
        barbershopId,
        clientId,
        nickname: { equals: caseName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!foundCase) {
      return {
        status: "FAILED",
        entityType: "CASE_FEE",
        field: "caseName",
        message: `Processo "${caseName}" não encontrado para o cliente. Importe o processo antes do honorário.`,
      };
    }
    targetCaseId = foundCase.id;
  } else {
    return {
      status: "FAILED",
      entityType: "CASE_FEE",
      field: "caseNumber",
      message: "Número do processo ou apelido do caso é obrigatório.",
    };
  }

  // Percentual (obrigatório).
  const rawPercent = cellValue(row, context, "percent");
  const percent = rawPercent ? normalizeMoney(rawPercent) : null;
  if (percent === null || percent < 0 || percent > 100) {
    return {
      status: "FAILED",
      entityType: "CASE_FEE",
      field: "percent",
      message: "Percentual do honorário é obrigatório e deve estar entre 0 e 100.",
    };
  }

  // Situação do honorário.
  const status = parseFeeStatus(cellValue(row, context, "feeStatus"));
  if (status.warning) warnings.push(status.warning);

  // Vencimento.
  const rawDueDate = cellValue(row, context, "feeDueDate");
  const dueDateIso = rawDueDate ? normalizeDate(rawDueDate) : null;
  if (rawDueDate && !dueDateIso) {
    return {
      status: "FAILED",
      entityType: "CASE_FEE",
      field: "feeDueDate",
      message: "Data de vencimento inválida. Use dd/mm/aaaa.",
    };
  }

  // Parcelas: só 1 é aceito na importação.
  const rawInstallments = cellValue(row, context, "feeInstallments");
  const installmentsResult = rawInstallments ? feeInstallmentsWarning(rawInstallments) : { value: 1 };
  if (installmentsResult?.warning) warnings.push(installmentsResult.warning);

  // Observações.
  const notes = cellValue(row, context, "feeNotes").slice(0, 2000) || null;

  // Criar o honorário. O valor é derivado pelo repositório (base × percent / 100).
  const dueDate = dueDateIso ? new Date(`${dueDateIso}T00:00:00.000Z`) : null;

  const created = await tx.caseSuccessFee.create({
    data: {
      barbershopId,
      caseId: targetCaseId!,
      percent,
      installments: installmentsResult?.value ?? 1,
      dueDate,
      notes,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "CASE_FEE",
    entityId: created.id,
    warnings,
    createdClientId,
  };
}
