/**
 * Processamento do lote de importação (worker).
 *
 * O lote é processado aba por aba, na **ordem de dependência** (serviços →
 * clientes → produtos → pacotes → horários → folgas → pacotes dos clientes →
 * fiado → agenda). Cada aba é processada em pedaços de 200 linhas: cada
 * pedaço roda numa transação — as entidades criadas e o resultado das linhas
 * entram juntos. Se a transação falhar, nada daquele pedaço fica no banco e
 * a fila reprocessa.
 *
 * Idempotência: a chave (batchId, sheetName, rowNumber) impede que a mesma
 * linha seja importada duas vezes. As linhas já processadas são puladas na
 * retomada.
 */
import { prisma } from "@/libs/prismaClient";
import type { BusinessSegment } from "@prisma/client";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { rlsTransaction } from "@/libs/prismaExtensions";
import { requestContext } from "@/shared/infra/http/requestContext";
import { IMPORT_CHUNK_SIZE } from "./dataImport.constants";
import type { ImportFieldKey, ImportPlan, ImportSheetPlan } from "./dataImport.types";
import { ImportBatchRepository } from "./repositories/ImportBatchRepository";
import { ImportRowResultRepository } from "./repositories/ImportRowResultRepository";
import { ImportCreatedEntityRepository } from "./repositories/ImportCreatedEntityRepository";
import { readSpreadsheetSheets } from "./utils/spreadsheetParser";
import { importClientRow } from "./processors/clientImporter";
import { importServiceRow } from "./processors/serviceImporter";
import { importAppointmentRow } from "./processors/appointmentImporter";
import { importStaffScheduleRow, importShopScheduleRow } from "./processors/scheduleImporter";
import { importTimeOffRow } from "./processors/timeOffImporter";
import { importProductRow } from "./processors/productImporter";
import { importServicePackageRow, importClientPackageRow } from "./processors/packageImporter";
import { importFiadoRow } from "./processors/fiadoImporter";
import { applyCrmCountersForBatch } from "./crmCounters";
import type { ImportRowContext, ProcessedRow } from "./processors/importRowContext";
import { CSV_SHEET_NAME, orderPlanSheets, readPlan, sheetKey } from "./importPlan";
import { deleteTempFile } from "./utils/tempFiles";

const logger = getModuleLogger("data-import:worker");

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

  let plan: ImportPlan;
  try {
    plan = readPlan(batch);
  } catch {
    await batches.update(batch.id, batch.barbershopId, {
      status: "FAILED",
      errorMessage: "Mapeamento do lote ausente.",
      finishedAt: new Date(),
    });
    throw new AppError("Mapeamento do lote ausente.", 400);
  }

  if (!plan.sheets.length) {
    await batches.update(batch.id, batch.barbershopId, {
      status: "FAILED",
      errorMessage: "Mapeamento do lote ausente.",
      finishedAt: new Date(),
    });
    throw new AppError("Mapeamento do lote ausente.", 400);
  }

  const parsedSheets = await readSpreadsheetSheets(batch.filePath, batch.fileFormat);
  const byName = new Map(
    parsedSheets.map((sheet) => [sheetKey(sheet.sheetName), sheet] as const),
  );

  const shop = await prisma.barbershop.findUnique({
    where: { id: batch.barbershopId },
    select: { businessSegment: true },
  });
  const segment = shop?.businessSegment ?? null;

  // O autor do lote é quem aprova a folga e quem assina o movimento de
  // estoque. Sem ele (lote antigo), o dono do salão assume.
  const actingUserId = batch.createdById ?? (await resolveOwnerId(batch.barbershopId));

  const ordered = orderPlanSheets(plan);
  const totalRows = ordered.reduce((sum, sheet) => {
    return sum + (byName.get(sheetKey(sheet.sheetName))?.rows.length ?? 0);
  }, 0);

  const processed = await rowsRepo.findProcessed(batch.id);
  const alreadyProcessed = new Set(
    processed.map((row) => `${row.sheetName}::${row.rowNumber}`),
  );

  let importedRows = batch.importedRows;
  let skippedRows = batch.skippedRows;
  let failedRows = batch.failedRows;
  let processedRows = batch.processedRows;

  for (const sheet of ordered) {
    const parsed = byName.get(sheetKey(sheet.sheetName));
    if (!parsed) {
      logger.warn({ batchId, sheet: sheet.sheetName }, "Aba do plano não existe mais no arquivo");
      continue;
    }

    const context = buildContext(parsed.headers, sheet, segment, batch.id, actingUserId);

    const pending: Array<{ rowNumber: number; row: Record<string, string> }> = [];
    parsed.rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const key = `${sheetKey(sheet.sheetName)}::${rowNumber}`;
      if (alreadyProcessed.has(key)) return;
      pending.push({ rowNumber, row });
    });

    for (let offset = 0; offset < pending.length; offset += IMPORT_CHUNK_SIZE) {
      const chunk = pending.slice(offset, offset + IMPORT_CHUNK_SIZE);

      const chunkResult = await requestContext.run({ barbershopId: batch.barbershopId }, () =>
        rlsTransaction(async (tx) => {
          const rowResults: Array<{
            batchId: string;
            barbershopId: string;
            sheetName: string;
            rowNumber: number;
            status: "IMPORTED" | "SKIPPED" | "FAILED";
            entityType: ProcessedRow["entityType"];
            entityId: string | null;
            errorMessage: string | null;
          }> = [];
          const created: Array<{
            entityType: NonNullable<ProcessedRow["entityType"]>;
            entityId: string;
            previousState?: Record<string, unknown> | null;
          }> = [];

          for (const item of chunk) {
            const outcome = await processRow(tx, batch.barbershopId, item.row, context, sheet.targetType);

            rowResults.push({
              batchId: batch.id,
              barbershopId: batch.barbershopId,
              sheetName: sheetKey(sheet.sheetName),
              rowNumber: item.rowNumber,
              status: outcome.status,
              entityType: outcome.entityType ?? null,
              entityId: outcome.entityId ?? null,
              errorMessage: outcome.message ?? null,
            });

            if (outcome.status === "IMPORTED" && outcome.entityType && outcome.entityId) {
              created.push({
                entityType: outcome.entityType,
                entityId: outcome.entityId,
                previousState: outcome.previousState ?? null,
              });
            }
            if (outcome.createdClientId) {
              created.push({ entityType: "CLIENT", entityId: outcome.createdClientId });
            }
            if (outcome.createdCaseId) {
              created.push({ entityType: "CASE", entityId: outcome.createdCaseId });
            }
            if (outcome.createdCategoryId) {
              created.push({
                entityType: "PRODUCT_CATEGORY",
                entityId: outcome.createdCategoryId,
              });
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
    totalRows,
    finishedAt: new Date(),
  });

  // O arquivo já cumpriu seu papel: some do disco.
  await deleteTempFile(batch.filePath);

  logger.info(
    { batchId, importedRows, skippedRows, failedRows },
    "Lote de importação processado",
  );

  return { batchId, totalRows, importedRows, skippedRows, failedRows };
}

/**
 * Dono do salão — usado como autor quando o lote não tem usuário (lote antigo,
 * criado antes do campo `createdById` existir).
 */
async function resolveOwnerId(barbershopId: string): Promise<string> {
  const owner = await prisma.user.findFirst({
    where: { barbershopId, role: { in: ["OWNER", "MASTER_ADMIN"] }, active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) {
    throw new AppError("Não há usuário do salão para assumir a importação.", 400);
  }
  return owner.id;
}

/** Monta o contexto de linha da aba. */
function buildContext(
  headers: string[],
  sheet: ImportSheetPlan,
  segment: BusinessSegment | null,
  batchId: string,
  actingUserId: string,
): ImportRowContext {
  const columnMap = new Map<ImportFieldKey, number>();
  for (const [column, field] of Object.entries(sheet.columns)) {
    const index = Number(column);
    if (Number.isInteger(index) && index >= 0) {
      columnMap.set(field as ImportFieldKey, index);
    }
  }
  return {
    headers,
    columnMap,
    options: sheet.options,
    segment,
    actingUserId,
    batchId,
  };
}

/** Processa uma linha conforme o alvo da aba. */
async function processRow(
  tx: Parameters<typeof importClientRow>[0],
  barbershopId: string,
  row: Record<string, string>,
  context: ImportRowContext,
  targetType: ImportSheetPlan["targetType"],
): Promise<ProcessedRow> {
  if (targetType === "CLIENTS") {
    return importClientRow(tx, barbershopId, row, context);
  }
  if (targetType === "SERVICES") {
    return importServiceRow(tx, barbershopId, row, context);
  }
  if (targetType === "STAFF_SCHEDULES") {
    return importStaffScheduleRow(tx, barbershopId, row, context);
  }
  if (targetType === "SHOP_SCHEDULE") {
    return importShopScheduleRow(tx, barbershopId, row, context);
  }
  if (targetType === "TIME_OFF") {
    return importTimeOffRow(tx, barbershopId, row, context);
  }
  if (targetType === "PRODUCTS") {
    return importProductRow(tx, barbershopId, row, context);
  }
  if (targetType === "SERVICE_PACKAGES") {
    return importServicePackageRow(tx, barbershopId, row, context);
  }
  if (targetType === "CLIENT_PACKAGES") {
    return importClientPackageRow(tx, barbershopId, row, context);
  }
  if (targetType === "FIADOS") {
    return importFiadoRow(tx, barbershopId, row, context);
  }
  return importAppointmentRow(tx, barbershopId, row, context);
}
