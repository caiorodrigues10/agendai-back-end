/**
 * Processador de linhas de fiado (dívida).
 *
 * Regras:
 *   • o fiado importado nasce com `origin = IMPORT`: ele **não entra no
 *     primeiro ciclo de cobrança** — a cobrança é sempre uma ação explícita
 *     do dono (o mesmo botão "Cobrar" do painel);
 *   • "valor já pago" vira um `FiadoPayment` de forma `other` e ajusta
 *     `paidAmount`/`status` pelas mesmas regras do `fiadoUseCases` — mas
 *     **sem** lançamento `FIADO_PAYMENT` no ledger financeiro e **sem**
 *     evento no ledger do CRM: importar dívida não é receber dinheiro
 *     (nada de caixa, nada de receita);
 *   • a mesma dívida (cliente + descrição + valor + vencimento) não entra
 *     duas vezes;
 *   • o cliente é identificado pelo WhatsApp; se existir, o fiado fica
 *     vinculado. A importação **não** cria cliente novo aqui (ao contrário
 *     do agendamento): fiado sem cliente no CRM é um registro de dívida
 *     simples e não altera o cadastro de clientes.
 */
import { salonClientDisplayName } from "@/modules/clients/utils/ensureSalonClient";
import { normalizeDate, normalizeMoney, normalizePhone } from "../utils/rowNormalization";
import { normalizeHeaderText } from "../utils/columnMapping";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import { lookupClientByPhone } from "./lookups";
import type { AppTx } from "@/libs/prismaClient";

export interface FiadoImportResult extends ProcessedRow {
  /** Pagamento de "valor já pago" criado junto. */
  paymentId?: string | null;
}

export async function importFiadoRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<FiadoImportResult> {
  const customerName = salonClientDisplayName(cellValue(row, context, "customerName"));
  if (!customerName) {
    return {
      status: "FAILED",
      entityType: "FIADO",
      field: "customerName",
      message: "Nome de quem deve ausente ou muito curto.",
    };
  }

  const rawPhone = cellValue(row, context, "whatsapp");
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      status: "FAILED",
      entityType: "FIADO",
      field: "whatsapp",
      message: rawPhone
        ? "Telefone inválido. Use DDD + número (10 ou 11 dígitos)."
        : "Telefone de quem deve ausente.",
    };
  }

  const description = cellValue(row, context, "fiadoDescription").slice(0, 500);
  if (description.length < 2) {
    return {
      status: "FAILED",
      entityType: "FIADO",
      field: "fiadoDescription",
      message: "Descrição da dívida ausente ou muito curta.",
    };
  }

  const originalAmount = normalizeMoney(cellValue(row, context, "originalAmount"));
  if (originalAmount === null || originalAmount <= 0) {
    return {
      status: "FAILED",
      entityType: "FIADO",
      field: "originalAmount",
      message: "Valor da dívida ausente ou inválido. Use número maior que zero.",
    };
  }

  const rawPaid = cellValue(row, context, "paidAmount");
  const paidAmount = rawPaid ? normalizeMoney(rawPaid) : 0;
  if (paidAmount === null) {
    return {
      status: "FAILED",
      entityType: "FIADO",
      field: "paidAmount",
      message: "Valor já pago inválido. Use número, ex.: 50 ou 50,00.",
    };
  }
  if (paidAmount > originalAmount) {
    return {
      status: "FAILED",
      entityType: "FIADO",
      field: "paidAmount",
      message: "O valor já pago não pode ser maior que o valor da dívida.",
    };
  }

  const dueDateRaw = normalizeDate(cellValue(row, context, "dueDate"));
  const dueDate = dueDateRaw ? new Date(`${dueDateRaw}T00:00:00.000Z`) : null;

  const client = await lookupClientByPhone(tx, barbershopId, phone);

  const duplicate = await findDuplicateFiado(tx, barbershopId, {
    customerName,
    phone,
    description,
    originalAmount,
    dueDate,
  });
  if (duplicate) {
    return {
      status: "SKIPPED",
      entityType: "FIADO",
      entityId: duplicate.id,
      message: "Esta dívida já está registrada (mesmo cliente, descrição, valor e vencimento).",
    };
  }

  const status = paidAmount >= originalAmount ? "PAID" : paidAmount > 0 ? "PARTIAL" : "PENDING";

  const created = await tx.fiado.create({
    data: {
      barbershopId,
      customerName,
      whatsapp: phone,
      clientId: client?.id ?? null,
      description,
      originalAmount,
      paidAmount: 0,
      status: "PENDING",
      dueDate,
      notes: cellValue(row, context, "notes").slice(0, 2000) || null,
      createdById: context.actingUserId,
      // IMPORT: a dívida importada não entra no primeiro ciclo de cobrança.
      origin: "IMPORT",
    },
    select: { id: true },
  });

  let paymentId: string | null = null;
  if (paidAmount > 0) {
    // Pagamento "histórico": fica visível na dívida, mas sem ledger
    // financeiro e sem evento no CRM — não houve caixa nesta importação.
    const payment = await tx.fiadoPayment.create({
      data: {
        fiadoId: created.id,
        amount: paidAmount,
        paymentMethod: "other",
        notes: "Valor pago importado da planilha",
        registeredById: context.actingUserId,
      },
      select: { id: true },
    });
    await tx.fiado.update({
      where: { id: created.id },
      data: { paidAmount, status },
    });
    paymentId = payment.id;
  }

  const warnings: string[] = [];
  if (!client) {
    warnings.push(
      "O telefone informado não bate com nenhum cliente do CRM: a dívida ficou sem vínculo com a ficha do cliente.",
    );
  }
  if (paidAmount > 0) {
    warnings.push(
      "O valor já pago foi registrado como histórico da dívida: não entrou no caixa nem no histórico financeiro.",
    );
  }

  return {
    status: "IMPORTED",
    entityType: "FIADO",
    entityId: created.id,
    warnings,
    paymentId,
  };
}

/** Dívida equivalente já cadastrada (evita duplicar na reimportação). */
async function findDuplicateFiado(
  tx: AppTx,
  barbershopId: string,
  input: {
    customerName: string;
    phone: string;
    description: string;
    originalAmount: number;
    dueDate: Date | null;
  },
) {
  const candidates = await tx.fiado.findMany({
    where: {
      barbershopId,
      whatsapp: input.phone,
      status: { not: "FORGIVEN" },
    },
    select: { id: true, customerName: true, description: true, originalAmount: true, dueDate: true },
    take: 50,
  });

  const nameKey = normalizeHeaderText(input.customerName);
  const descriptionKey = normalizeHeaderText(input.description);
  const dueKey = input.dueDate ? input.dueDate.toISOString().slice(0, 10) : null;

  return (
    candidates.find((candidate) => {
      if (normalizeHeaderText(candidate.customerName) !== nameKey) return false;
      if (normalizeHeaderText(candidate.description) !== descriptionKey) return false;
      if (Math.abs(candidate.originalAmount - input.originalAmount) > 0.01) return false;
      const candidateDue = candidate.dueDate ? candidate.dueDate.toISOString().slice(0, 10) : null;
      return candidateDue === dueKey;
    }) ?? null
  );
}
