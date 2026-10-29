/**
 * Processador de linhas de clientes.
 *
 * Regra de identidade: o telefone é a identidade do cliente (o mesmo do CRM
 * do sistema). Cliente com telefone já cadastrado é atualizado, não duplicado.
 * Cliente sem telefone não entra: sem identidade o lote criaria cópias a
 * cada reimportação.
 */
import { salonClientDisplayName, salonClientWhatsappKey } from "@/modules/clients/utils/ensureSalonClient";
import { normalizePhone } from "../utils/rowNormalization";
import { cellValue, type ImportRowContext, type ProcessedRow } from "./importRowContext";
import type { AppTx } from "@/libs/prismaClient";

export interface ClientImportResult extends ProcessedRow {
  clientId?: string | null;
}

export async function importClientRow(
  tx: AppTx,
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
): Promise<ClientImportResult> {
  const name = salonClientDisplayName(cellValue(row, context, "name"));
  if (!name) {
    return {
      status: "FAILED",
      message: "Nome do cliente ausente ou muito curto.",
      entityType: "CLIENT",
    };
  }

  const rawPhone = cellValue(row, context, "whatsapp");
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      status: "FAILED",
      message: rawPhone
        ? "Telefone inválido. Use DDD + número (10 ou 11 dígitos)."
        : "Telefone do cliente ausente.",
      entityType: "CLIENT",
    };
  }

  const notes = cellValue(row, context, "notes").slice(0, 2000) || null;

  const existing = await tx.salonClient.findFirst({
    where: { barbershopId, normalizedWhatsapp: phone },
    select: { id: true, name: true, notes: true },
  });

  if (existing) {
    if (!context.options.updateExisting) {
      return {
        status: "SKIPPED",
        entityType: "CLIENT",
        entityId: existing.id,
        message: "Cliente já cadastrado.",
      };
    }
    const updated = await tx.salonClient.update({
      where: { id: existing.id },
      data: {
        name,
        notes: notes ?? existing.notes,
      },
      select: { id: true },
    });
    return {
      status: "SKIPPED",
      entityType: "CLIENT",
      entityId: updated.id,
      message: "Cliente já existia e foi atualizado.",
    };
  }

  const created = await tx.salonClient.create({
    data: {
      barbershopId,
      name,
      whatsapp: phone,
      normalizedWhatsapp: phone,
      notes,
      // Cliente importado nunca entra em campanha de marketing sem consentimento.
      marketingOptIn: false,
      marketingOptInAt: null,
      marketingOptInSource: null,
    },
    select: { id: true },
  });

  return {
    status: "IMPORTED",
    entityType: "CLIENT",
    entityId: created.id,
    clientId: created.id,
  };
}
