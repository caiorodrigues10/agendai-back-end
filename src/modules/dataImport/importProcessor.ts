/**
 * Processamento do lote de importação (worker).
 *
 * O lote é processado em pedaços de 200 linhas. Cada pedaço roda numa
 * transação: as entidades criadas e o resultado das linhas entram juntos. Se a
 * transação falhar, nada daquele pedaço fica no banco e a fila reprocessa.
 *
 * Idempotência: a chave (batchId, rowNumber) impede que a mesma linha seja
 * importada duas vezes. As linhas já processadas são puladas na retomada.
 */
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { rlsTransaction } from "@/libs/prismaExtensions";
import { requestContext } from "@/shared/infra/http/requestContext";
import { IMPORT_CHUNK_SIZE } from "./dataImport.constants";
import type { ImportFieldKey, ImportOptions } from "./dataImport.types";
import { ImportBatchRepository } from "./repositories/ImportBatchRepository";
import { ImportRowResultRepository } from "./repositories/ImportRowResultRepository";
import { ImportCreatedEntityRepository } from "./repositories/ImportCreatedEntityRepository";
import { readSpreadsheet } from "./utils/spreadsheetParser";
import { importClientRow } from "./processors/clientImporter";
import { importServiceRow } from "./processors/serviceImporter";
import { importAppointmentRow } from "./processors/appointmentImporter";
import { applyCrmCountersForBatch } from "./crmCounters";
import type { ImportRowContext } from "./processors/importRowContext";
import { deleteTempFile } from "./utils/tempFiles";

const logger = getModuleLogger("data-import:worker");

interface StoredMapping {
  columns: Record<string, string>;
  options: ImportOptions;
}

export interface ProcessBatchResult {
  batchId: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
}

/** Processa o lote inteiro. Chamado pelo worker da fila. */
export async function processImportBatch(batchId: string): Promise<ProcessBatchResult> {
  const batches = new ImportBatchRepository();
  const rowsRepo = new ImportRowResultRepository();
  const entitiesRepo = new ImportCreatedEntityRepository();

  const batch = await batches.findByIdAnyTenant(batchId);
  if (!batch) {
    logger.warn({ batchId }, "Lote de importação não encontrado");
    return { batchId, totalRows: 0, importedRows: 0, skippedRows: 0, failedRows: 0 };
  }
  if (batch.status !== "PROCESSING") {
    logger.info({ batchId, status: batch.status }, "Lote fora de processamento — ignorado");
    return {
      batchId,
      totalRows: batch.totalRows,
      importedRows: batch.importedRows,
      skippedRows: batch.skippedRows,
      failedRows: batch.failedRows,
    };
  }

  const stored = batch.mapping as StoredMapping | null;
  if (!stored?.columns || !stored.options) {
    await batches.update(batch.id, batch.barbershopId, {
      status: "FAILED",
      errorMessage: "Mapeamento do lote ausente.",
      finishedAt: new Date(),
    });
    throw new AppError("Mapeamento do lote ausente.", 400);
  }

  const parsed = await readSpreadsheet(batch.filePath, batch.fileFormat, batch.sheetName);

  const shop = await prisma.barbershop.findUnique({
    where: { id: batch.barbershopId },
    select: { businessSegment: true },
  });

  const context: ImportRowContext = {
    headers: parsed.headers,
    columnMap: new Map<ImportFieldKey, number>(
      Object.entries(stored.columns).map(([column, field]) => [field as ImportFieldKey, Number(column)]),
    ),
    options: stored.options,
    segment: shop?.businessSegment ?? null,
  };

  const alreadyProcessed = new Set(
    (await rowsRepo.findProcessed(batch.id)).map((row) => row.rowNumber),
  );

  let importedRows = batch.importedRows;
  let skippedRows = batch.skippedRows;
  let failedRows = batch.failedRows;
  let processedRows = batch.processedRows;

  const pending: Array<{ rowNumber: number; row: Record<string, string> }> = [];
  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (alreadyProcessed.has(rowNumber)) return;
    pending.push({ rowNumber, row });
  });

  for (let offset = 0; offset < pending.length; offset += IMPORT_CHUNK_SIZE) {
    const chunk = pending.slice(offset, offset + IMPORT_CHUNK_SIZE);

    const chunkResult = await requestContext.run({ barbershopId: batch.barbershopId }, () =>
      rlsTransaction(async (tx) => {
        const rowResults: Array<{
          batchId: string;
          barbershopId: string;
          rowNumber: number;
          status: "IMPORTED" | "SKIPPED" | "FAILED";
          entityType: "CLIENT" | "SERVICE" | "APPOINTMENT" | "CASE" | null;
          entityId: string | null;
          errorMessage: string | null;
        }> = [];
        const created: Array<{ entityType: "CLIENT" | "SERVICE" | "APPOINTMENT" | "CASE"; entityId: string }> = [];

        for (const item of chunk) {
          const outcome = await processRow(tx, batch.barbershopId, item.row, context, batch.targetType);

          rowResults.push({
            batchId: batch.id,
            barbershopId: batch.barbershopId,
            rowNumber: item.rowNumber,
            status: outcome.status,
            entityType: outcome.entityType ?? null,
            entityId: outcome.entityId ?? null,
            errorMessage: outcome.message ?? null,
          });

          if (outcome.status === "IMPORTED" && outcome.entityType && outcome.entityId) {
            created.push({ entityType: outcome.entityType, entityId: outcome.entityId });
          }
          if (outcome.createdClientId) {
            created.push({ entityType: "CLIENT", entityId: outcome.createdClientId });
          }
          if (outcome.createdCaseId) {
            created.push({ entityType: "CASE", entityId: outcome.createdCaseId });
          }
        }

        await rowsRepo.createMany(rowResults);
        await entitiesRepo.createMany(batch.id, batch.barbershopId, created);

        return {
          imported: rowResults.filter((row) => row.status === "IMPORTED").length,
          skipped: rowResults.filter((row) => row.status === "SKIPPED").length,
          failed: rowResults.filter((row) => row.status === "FAILED").length,
        };
      }),
    );

    importedRows += chunkResult.imported;
    skippedRows += chunkResult.skipped;
    failedRows += chunkResult.failed;
    processedRows += chunk.length;

    await batches.update(batch.id, batch.barbershopId, {
      processedRows,
      importedRows,
      skippedRows,
      failedRows,
    });
  }

  // Contadores de CRM: o cliente importado passa a ter total de agendamentos
  // e última visita atualizados — sem notificar ninguém, sem comissão e sem
  // lançamento financeiro. Roda antes de fechar o lote para o desfazer
  // continuar conseguindo remover o que foi criado.
  await requestContext.run({ barbershopId: batch.barbershopId }, async () => {
    await applyCrmCountersForBatch(batch.id, batch.barbershopId);
  });

  const finalStatus = failedRows > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
  await batches.update(batch.id, batch.barbershopId, {
    status: finalStatus,
    processedRows,
    importedRows,
    skippedRows,
    failedRows,
    finishedAt: new Date(),
  });

  // O arquivo já cumpriu seu papel: some do disco.
  await deleteTempFile(batch.filePath);

  logger.info(
    { batchId, importedRows, skippedRows, failedRows },
    "Lote de importação processado",
  );

  return { batchId, totalRows: parsed.rows.length, importedRows, skippedRows, failedRows };
}

/** Processa uma linha conforme o alvo do lote. */
async function processRow(
  tx: Parameters<typeof importClientRow>[0],
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  targetType: "CLIENTS" | "SERVICES" | "APPOINTMENTS",
) {
  if (targetType === "CLIENTS") {
    return importClientRow(tx, barbershopId, row, context);
  }
  if (targetType === "SERVICES") {
    return importServiceRow(tx, barbershopId, row, context);
  }
  return importAppointmentRow(tx, barbershopId, row, context);
}
