/**
 * Use cases do assistente de importação de planilhas.
 *
 * O fluxo tem 7 etapas e cada etapa é uma operação idempotente:
 *   1. upload        — o arquivo entra e é lido (todas as abas);
 *   2. alvo          — o dono escolhe o que cada aba importa;
 *   3. mapa          — o dono ajusta o mapeamento de colunas de cada aba;
 *   4. validação    — dry-run: mostra o que entra e o que é rejeitado;
 *   5. prévia       — o dono confirma;
 *   6. conclusão    — a fila processa o lote;
 *   7. histórico    — o dono vê o resultado e pode desfazer (30 dias).
 *
 * O estado do lote vive no banco: o dono pode sair da tela e voltar depois.
 *
 * **Multi-aba:** uma planilha pode ter abas de tipos diferentes. O lote guarda
 * um *plano* (JSON do mapeamento) com uma entrada por aba. As abas são
 * processadas na ordem de dependência — serviço antes da agenda, pacote do
 * catálogo antes do saldo do cliente, cliente antes do fiado.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { getSegmentConfig } from "@/shared/segments";
import type { BusinessSegment } from "@prisma/client";
import {
  DEFAULT_IMPORT_OPTIONS,
  IMPORT_FIELDS_BY_TARGET,
  IMPORT_UNDO_WINDOW_DAYS,
  IMPORT_TARGET_LABELS,
  MAX_ACTIVE_IMPORT_BATCHES,
  MAX_IMPORT_BATCHES_PER_HOUR,
  availableImportTargets,
} from "./dataImport.constants";
import type {
  ImportFieldKey,
  ImportFieldView,
  ImportOptions,
  ImportPlan,
  ImportSheetInfo,
  ImportSheetPlan,
  ImportSheetPlanView,
  ImportTargetType,
  RowValidationResult,
  ValidationSummary,
} from "./dataImport.types";
import { ImportBatchRepository } from "./repositories/ImportBatchRepository";
import { ImportRowResultRepository } from "./repositories/ImportRowResultRepository";
import { ImportCreatedEntityRepository } from "./repositories/ImportCreatedEntityRepository";
import { validateImportFile } from "./utils/fileValidation";
import {
  readSpreadsheet,
  readSpreadsheetPreview,
  readSpreadsheetSheets,
} from "./utils/spreadsheetParser";
import {
  availableFields,
  detectColumns,
  getFieldLabel,
  invertColumnMapping,
  toColumnMap,
} from "./utils/columnMapping";
import { validateRow } from "./utils/rowValidator";
import type { ImportRowContext } from "./processors/importRowContext";
import { deleteTempFile, saveTempFile } from "./utils/tempFiles";
import { buildErrorCsv } from "./utils/sanitize";
import { requestContext } from "@/shared/infra/http/requestContext";
import {
  CSV_SHEET_NAME,
  orderPlanSheets,
  planBatchTargetType,
  readPlan,
  serializePlan,
  sheetKey,
} from "./importPlan";

const logger = getModuleLogger("data-import");

/** Uma aba do plano como o dono envia (mapa + opções da aba). */
export interface SheetPlanInput {
  sheetName: string | null;
  targetType: ImportTargetType;
  columns: Record<string, string>;
  options?: Partial<ImportOptions>;
}

export class DataImportUseCases {
  private batches = new ImportBatchRepository();
  private rows = new ImportRowResultRepository();
  private entities = new ImportCreatedEntityRepository();

  /** Etapa 1 — upload do arquivo. */
  async upload(params: {
    barbershopId: string;
    userId?: string | null;
    fileName: string;
    buffer: Buffer;
  }) {
    const { barbershopId, userId, fileName, buffer } = params;

    await this.assertQuota(barbershopId);

    const validated = validateImportFile(fileName, buffer);
    const filePath = await saveTempFile(buffer, validated.extension);

    try {
      const sheets = await readSpreadsheetSheets(filePath, validated.format);
      const first = sheets[0];
      if (!first) {
        throw new AppError("A planilha enviada não tem abas com conteúdo.", 400);
      }

      const expiresAt = new Date(Date.now() + IMPORT_UNDO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const batch = await this.batches.create({
        barbershopId,
        fileName: validated.fileName,
        filePath,
        fileSize: validated.fileSize,
        fileFormat: validated.format,
        sheetName: first.sheetName,
        targetType: "CLIENTS",
        headers: first.headers,
        createdById: userId ?? null,
        expiresAt,
      });

      return {
        id: batch.id,
        fileName: batch.fileName,
        fileFormat: batch.fileFormat,
        targetType: batch.targetType,
        status: batch.status,
        sheetNames: sheets.map((sheet) => sheet.sheetName).filter((name): name is string => !!name),
        selectedSheet: first.sheetName,
        headers: first.headers,
        preview: first.rows.slice(0, 20),
        totalRows: first.rows.length,
        sheets: sheets.map((sheet) => this.toSheetInfo(sheet)),
        createdAt: batch.createdAt,
        expiresAt: batch.expiresAt,
      };
    } catch (err) {
      await deleteTempFile(filePath);
      throw err;
    }
  }

  /**
   * Etapa 2 — dono escolhe o que cada aba importa.
   *
   * Aceita duas formas:
   *   • `{ targetType, sheetName }` — uma aba só (Fase 1);
   *   • `{ sheets: [{ sheetName, targetType }] }` — uma aba por tipo (Fase 2).
   */
  async configureTarget(params: {
    barbershopId: string;
    batchId: string;
    targetType?: ImportTargetType;
    sheetName?: string | null;
    sheets?: Array<{ sheetName: string | null; targetType: ImportTargetType }>;
  }) {
    const batch = await this.requireBatch(params.barbershopId, params.batchId);
    if (batch.status === "PROCESSING") {
      throw new AppError("Este lote já está sendo processado.", 409);
    }
    if (batch.status === "UNDONE") {
      throw new AppError("Este lote já foi desfeito.", 409);
    }

    const segment = await this.resolveSegment(params.barbershopId);
    const allowedTargets = new Set(availableImportTargets(segment));

    const requested = params.sheets?.length
      ? params.sheets
      : params.targetType
        ? [{ sheetName: params.sheetName ?? batch.sheetName ?? null, targetType: params.targetType }]
        : [];

    if (!requested.length) {
      throw new AppError("Escolha o que importar.", 400);
    }

    for (const item of requested) {
      if (!allowedTargets.has(item.targetType)) {
        throw new AppError(
          `A importação de "${IMPORT_TARGET_LABELS[item.targetType]}" não está disponível para este estabelecimento.`,
          400,
        );
      }
    }

    const parsedSheets = await readSpreadsheetSheets(batch.filePath, batch.fileFormat);
    const byName = new Map(
      parsedSheets.map((sheet) => [sheetKey(sheet.sheetName), sheet] as const),
    );

    const plan: ImportPlan = { sheets: [] };
    const views: ImportSheetPlanView[] = [];

    for (const item of requested) {
      const sheet = byName.get(sheetKey(item.sheetName));
      if (!sheet) {
        throw new AppError("A aba escolhida não existe mais na planilha.", 400);
      }

      const detected = detectColumns(sheet.headers, item.targetType, segment);
      const columns = toColumnMap(detected);
      const missing = this.missingFields(item.targetType, columns, segment);

      const sheetPlan: ImportSheetPlan = {
        sheetName: sheet.sheetName,
        targetType: item.targetType,
        columns,
        options: { ...DEFAULT_IMPORT_OPTIONS },
      };
      plan.sheets.push(sheetPlan);
      views.push({
        ...this.toSheetView(sheetPlan, sheet.headers, sheet.rows, segment),
        detectedColumns: detected,
        missing,
      });
    }

    const batchTargetType = planBatchTargetType(plan);
    const firstSheet = plan.sheets[0];

    await this.batches.update(batch.id, params.barbershopId, {
      targetType: batchTargetType,
      sheetName: firstSheet.sheetName,
      headers: byName.get(sheetKey(firstSheet.sheetName))?.headers ?? [],
      mapping: serializePlan(plan),
      status: "MAPPING",
    });

    return {
      id: batch.id,
      targetType: batchTargetType,
      status: "MAPPING" as const,
      sheetNames: parsedSheets
        .map((sheet) => sheet.sheetName)
        .filter((name): name is string => !!name),
      selectedSheet: firstSheet.sheetName,
      headers: byName.get(sheetKey(firstSheet.sheetName))?.headers ?? [],
      fields: views[0]?.fields ?? [],
      detectedColumns: views[0]?.detectedColumns ?? {},
      preview: byName.get(sheetKey(firstSheet.sheetName))?.rows.slice(0, 20) ?? [],
      totalRows: byName.get(sheetKey(firstSheet.sheetName))?.rows.length ?? 0,
      sheets: views,
    };
  }

  /**
   * Etapa 3 — dono ajusta o mapeamento e as opções.
   *
   * Aceita duas formas:
   *   • `{ columns, options }` — a aba única do plano (Fase 1);
   *   • `{ sheets: [{ sheetName, targetType, columns, options }] }` — todas as
   *     abas (Fase 2).
   */
  async saveMapping(params: {
    barbershopId: string;
    batchId: string;
    columns?: Record<string, string>;
    options?: Partial<ImportOptions>;
    sheets?: SheetPlanInput[];
  }) {
    const batch = await this.requireBatch(params.barbershopId, params.batchId);
    if (batch.status === "PROCESSING") {
      throw new AppError("Este lote já está sendo processado.", 409);
    }

    const segment = await this.resolveSegment(params.barbershopId);
    const current = this.readPlanSafe(batch);

    const inputs: SheetPlanInput[] = params.sheets?.length
      ? params.sheets
      : params.columns
        ? [
            {
              sheetName: current.sheets[0]?.sheetName ?? batch.sheetName ?? null,
              targetType:
                current.sheets[0]?.targetType ?? (batch.targetType as ImportTargetType),
              columns: params.columns,
              options: params.options,
            },
          ]
        : [];

    if (!inputs.length) {
      throw new AppError("Mapeie as colunas da planilha antes de continuar.", 400);
    }

    const plan: ImportPlan = { sheets: [] };

    for (const input of inputs) {
      const columnMap = invertColumnMapping(input.columns);
      const fields = availableFields(input.targetType, segment);
      const validFields = new Set(fields.map((field) => field.key));

      for (const [field, column] of Object.entries(columnMap)) {
        if (!validFields.has(field as ImportFieldKey)) {
          throw new AppError(`Campo "${field}" não se aplica a este tipo de importação.`, 400);
        }
        if (!Number.isInteger(column) || column < 0) {
          throw new AppError("Mapa de colunas inválido.", 400);
        }
      }

      const missing = fields
        .filter((field) => field.required && columnMap[field.key] === undefined)
        .map((field) => getFieldLabel(field, segment));
      if (missing.length) {
        const sheetLabel = input.sheetName ? `aba "${input.sheetName}"` : "aba";
        throw new AppError(
          `Falta mapear na ${sheetLabel}: ${missing.join(", ")}. Ajuste o mapa antes de continuar.`,
          400,
        );
      }

      plan.sheets.push({
        sheetName: input.sheetName,
        targetType: input.targetType,
        columns: toColumnMap(columnMap),
        options: { ...DEFAULT_IMPORT_OPTIONS, ...(input.options ?? {}) },
      });
    }

    const stored = serializePlan(plan);
    await this.batches.update(batch.id, params.barbershopId, {
      mapping: stored,
      targetType: planBatchTargetType(plan),
      sheetName: plan.sheets[0]?.sheetName ?? null,
      status: "MAPPING",
    });

    return { id: batch.id, status: "MAPPING" as const, mapping: stored, plan };
  }

  /** Etapa 4 — dry-run. Não escreve nada no banco. */
  async validate(params: { barbershopId: string; batchId: string }): Promise<ValidationSummary> {
    const batch = await this.requireBatch(params.barbershopId, params.batchId);
    const plan = this.readPlan(batch);
    const segment = await this.resolveSegment(params.barbershopId);

    const parsedSheets = await readSpreadsheetSheets(batch.filePath, batch.fileFormat);
    const byName = new Map(
      parsedSheets.map((sheet) => [sheetKey(sheet.sheetName), sheet] as const),
    );

    const ordered = orderPlanSheets(plan);
    const totalRows = ordered.reduce((sum, sheet) => {
      return sum + (byName.get(sheetKey(sheet.sheetName))?.rows.length ?? 0);
    }, 0);

    await this.batches.update(batch.id, params.barbershopId, {
      status: "VALIDATING",
      totalRows,
    });

    try {
      const results: RowValidationResult[] = [];
      const warnings: string[] = [];
      let validRows = 0;
      let failedRows = 0;
      let skippedRows = 0;

      await requestContext.run({ barbershopId: params.barbershopId }, async () => {
        for (const sheet of ordered) {
          const parsed = byName.get(sheetKey(sheet.sheetName));
          if (!parsed) {
            throw new AppError("A aba escolhida não existe mais na planilha.", 400);
          }

          const context = this.buildContext(parsed.headers, sheet, segment, batch);
          const sheetLabel = sheet.sheetName ?? CSV_SHEET_NAME;

          for (let index = 0; index < parsed.rows.length; index += 1) {
            const rowNumber = index + 1;
            const result = await validateRow(
              prisma,
              params.barbershopId,
              parsed.rows[index],
              context,
              sheet.targetType,
              rowNumber,
            );
            const withSheet = { ...result, sheetName: sheet.sheetName };
            if (result.status === "VALID") validRows += 1;
            else if (result.status === "SKIPPED") skippedRows += 1;
            else failedRows += 1;
            results.push(withSheet);
            for (const warning of result.warnings ?? []) {
              warnings.push(`Aba ${sheetLabel}, linha ${rowNumber}: ${warning}`);
            }
          }
        }
      });

      await this.batches.update(batch.id, params.barbershopId, {
        status: "AWAITING_CONFIRMATION",
        totalRows,
      });

      return {
        totalRows,
        validRows,
        skippedRows,
        failedRows,
        results,
        warnings,
      };
    } catch (err) {
      // Um dry-run que quebra não pode deixar o lote preso em "validando":
      // o dono precisa conseguir corrigir o mapa e tentar de novo.
      await this.batches.update(batch.id, params.barbershopId, {
        status: "MAPPING",
        errorMessage: err instanceof Error ? err.message : "Falha na validação.",
      });
      throw err;
    }
  }

  /** A fila recusou o lote: volta para "aguardando confirmação". */
  async confirmFailed(params: { barbershopId: string; batchId: string }) {
    await this.batches.update(params.batchId, params.barbershopId, {
      status: "AWAITING_CONFIRMATION",
      errorMessage: "Não foi possível enfileirar o processamento. Tente confirmar de novo.",
    });
  }

  /** Cancelar um lote que o dono abandonou. */
  async cancel(params: { barbershopId: string; batchId: string }) {
    const batch = await this.requireBatch(params.barbershopId, params.batchId);
    if (batch.status === "PROCESSING") {
      throw new AppError("Não é possível cancelar uma importação em processamento.", 409);
    }
    if (batch.status === "UNDONE") {
      throw new AppError("Este lote já foi desfeito.", 409);
    }

    await this.batches.update(batch.id, params.barbershopId, {
      status: "CANCELLED",
      finishedAt: new Date(),
    });
    await deleteTempFile(batch.filePath);

    return { id: batch.id, status: "CANCELLED" as const };
  }

  /** Etapa 5 — o dono confirma. O processamento real acontece na fila. */
  async confirm(params: { barbershopId: string; batchId: string }) {
    const batch = await this.requireBatch(params.barbershopId, params.batchId);
    if (batch.status === "COMPLETED" || batch.status === "COMPLETED_WITH_ERRORS") {
      throw new AppError("Este lote já foi concluído.", 409);
    }
    if (batch.status === "PROCESSING") {
      throw new AppError("Este lote já está em processamento.", 409);
    }
    if (batch.status === "UNDONE") {
      throw new AppError("Este lote já foi desfeito.", 409);
    }

    const plan = this.readPlan(batch);
    const segment = await this.resolveSegment(params.barbershopId);
    const parsedSheets = await readSpreadsheetSheets(batch.filePath, batch.fileFormat);
    const byName = new Map(
      parsedSheets.map((sheet) => [sheetKey(sheet.sheetName), sheet] as const),
    );

    // Todas as abas precisam estar mapeadas antes de confirmar.
    for (const sheet of plan.sheets) {
      const parsed = byName.get(sheetKey(sheet.sheetName));
      if (!parsed) {
        throw new AppError("A aba escolhida não existe mais na planilha.", 400);
      }
      this.buildContext(parsed.headers, sheet, segment, batch);
    }

    const totalRows = plan.sheets.reduce((sum, sheet) => {
      return sum + (byName.get(sheetKey(sheet.sheetName))?.rows.length ?? 0);
    }, 0);

    await this.batches.update(batch.id, params.barbershopId, {
      status: "PROCESSING",
      totalRows,
      startedAt: new Date(),
      errorMessage: null,
    });

    return { id: batch.id, status: "PROCESSING" as const, totalRows };
  }

  /** Histórico de importações do salão. */
  async list(barbershopId: string) {
    const batches = await this.batches.list(barbershopId);
    return batches.map((batch) => this.toSummary(batch));
  }

  /** Detalhe de um lote (progresso + últimas linhas com erro). */
  async get(barbershopId: string, batchId: string) {
    const batch = await this.requireBatch(barbershopId, batchId);
    const failures = await this.rows.listByBatch(batch.id, barbershopId, 200);
    const counts = await this.rows.countByStatus(batch.id);

    let plan: ImportPlan | null = null;
    try {
      plan = this.readPlan(batch);
    } catch {
      plan = null;
    }

    return {
      ...this.toSummary(batch),
      mapping: batch.mapping,
      plan,
      counts,
      rows: failures.filter((row) => row.status === "FAILED" || row.status === "SKIPPED"),
    };
  }

  /** CSV com as linhas rejeitadas (pronto para abrir e corrigir). */
  async errorsCsv(barbershopId: string, batchId: string) {
    const batch = await this.requireBatch(barbershopId, batchId);
    const rows = await this.rows.listByBatch(batch.id, barbershopId, 5000);
    const failed = rows.filter((row) => row.status === "FAILED" || row.status === "SKIPPED");

    const content = buildErrorCsv(
      failed.map((row) => ({
        Aba: row.sheetName,
        Linha: String(row.rowNumber),
        Situacao: row.status === "FAILED" ? "Rejeitada" : "Ignorada",
        Motivo: row.errorMessage ?? "",
      })),
    );

    return {
      fileName: `erros-importacao-${batch.id.slice(0, 8)}.csv`,
      content,
    };
  }

  /** Prévia do arquivo (usada ao voltar para a etapa de mapa). */
  async preview(barbershopId: string, batchId: string) {
    const batch = await this.requireBatch(barbershopId, batchId);
    const parsed = await readSpreadsheetPreview(
      batch.filePath,
      batch.fileFormat,
      batch.sheetName,
      20,
    );
    return {
      headers: parsed.headers,
      rows: parsed.rows,
      sheetNames: parsed.sheetNames,
      selectedSheet: parsed.selectedSheet,
    };
  }

  /** Lote que ainda pode ser retomado (o dono saiu da tela no meio). */
  async findResumable(barbershopId: string) {
    const active = await this.batches.findActive(barbershopId);
    if (!active.length) return null;
    const batch = active[0];
    return this.toSummary(batch);
  }

  // ─── Internos ──────────────────────────────────────────────────────────────

  private async requireBatch(barbershopId: string, batchId: string) {
    const batch = await this.batches.findById(batchId, barbershopId);
    if (!batch) throw new AppError("Importação não encontrada.", 404);
    return batch;
  }

  /** Cotas: no máximo 5 importações por hora e 1 importação ativa. */
  private async assertQuota(barbershopId: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const started = await this.batches.countStartedSince(barbershopId, oneHourAgo);
    if (started >= MAX_IMPORT_BATCHES_PER_HOUR) {
      throw new AppError(
        `Limite de ${MAX_IMPORT_BATCHES_PER_HOUR} importações por hora atingido. Tente mais tarde.`,
        429,
      );
    }

    const active = await this.batches.findActive(barbershopId);
    if (active.length >= MAX_ACTIVE_IMPORT_BATCHES) {
      throw new AppError(
        "Já existe uma importação em andamento. Conclua ou cancele antes de enviar outro arquivo.",
        409,
      );
    }
  }

  private readPlan(batch: {
    targetType: string;
    sheetName: string | null;
    mapping: unknown;
  }): ImportPlan {
    return readPlan(batch);
  }

  /**
   * Plano do lote sem exigir que ele já exista.
   *
   * No primeiro mapeamento o lote ainda não tem plano — o dono está escolhendo
   * agora. A forma legada usa o alvo gravado no lote; a multi-aba traz o plano
   * junto no corpo da requisição.
   */
  private readPlanSafe(batch: {
    targetType: string;
    sheetName: string | null;
    mapping: unknown;
  }): ImportPlan {
    try {
      return readPlan(batch);
    } catch {
      return { sheets: [] };
    }
  }

  private buildContext(
    headers: string[],
    sheet: ImportSheetPlan,
    segment: BusinessSegment | null,
    batch?: { id: string; createdById: string | null },
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
      actingUserId: batch?.createdById ?? "",
      batchId: batch?.id ?? "",
    };
  }

  private async resolveSegment(barbershopId: string): Promise<BusinessSegment | null> {
    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { businessSegment: true },
    });
    return shop?.businessSegment ?? null;
  }

  private describeFields(targetType: ImportTargetType, segment: BusinessSegment | null) {
    return availableFields(targetType, segment).map((field) => ({
      key: field.key,
      label: getFieldLabel(field, segment),
      required: field.required,
      type: field.type,
      hint: field.hint,
      synonyms: field.synonyms,
    }));
  }

  /** Campos obrigatórios que ainda não foram mapeados. */
  private missingFields(
    targetType: ImportTargetType,
    columns: Record<string, string>,
    segment: BusinessSegment | null,
  ): string[] {
    const mapped = new Set(Object.values(columns));
    return availableFields(targetType, segment)
      .filter((field) => field.required && !mapped.has(field.key))
      .map((field) => getFieldLabel(field, segment));
  }

  /** Uma aba do plano como o dono a vê. */
  private toSheetView(
    sheet: ImportSheetPlan,
    headers: string[],
    rows: Array<Record<string, string>>,
    segment: BusinessSegment | null,
  ): ImportSheetPlanView {
    const fields: ImportFieldView[] = availableFields(sheet.targetType, segment).map((field) => ({
      key: field.key,
      label: getFieldLabel(field, segment),
      required: field.required,
      type: field.type,
      hint: field.hint,
      synonyms: field.synonyms,
    }));

    const columnMap = invertColumnMapping(sheet.columns);

    return {
      sheetName: sheet.sheetName,
      targetType: sheet.targetType,
      fields,
      detectedColumns: columnMap,
      columns: sheet.columns,
      options: sheet.options,
      missing: this.missingFields(sheet.targetType, sheet.columns, segment),
      totalRows: rows.length,
      preview: rows.slice(0, 20),
      warnings: [],
    };
  }

  private toSheetInfo(sheet: {
    sheetName: string | null;
    headers: string[];
    rows: Array<Record<string, string>>;
  }): ImportSheetInfo {
    return {
      sheetName: sheet.sheetName,
      headers: sheet.headers,
      preview: sheet.rows.slice(0, 20),
      totalRows: sheet.rows.length,
    };
  }

  private toSummary(batch: {
    id: string;
    fileName: string;
    fileFormat: string;
    targetType: string;
    status: string;
    sheetName: string | null;
    totalRows: number;
    processedRows: number;
    importedRows: number;
    failedRows: number;
    skippedRows: number;
    errorMessage: string | null;
    createdAt: Date;
    finishedAt: Date | null;
    undoneAt: Date | null;
    expiresAt: Date;
  }) {
    return {
      id: batch.id,
      fileName: batch.fileName,
      fileFormat: batch.fileFormat,
      targetType: batch.targetType,
      status: batch.status,
      sheetName: batch.sheetName,
      totalRows: batch.totalRows,
      processedRows: batch.processedRows,
      importedRows: batch.importedRows,
      failedRows: batch.failedRows,
      skippedRows: batch.skippedRows,
      errorMessage: batch.errorMessage,
      createdAt: batch.createdAt,
      finishedAt: batch.finishedAt,
      undoneAt: batch.undoneAt,
      expiresAt: batch.expiresAt,
      canUndo: this.canUndo(batch),
    };
  }

  /** O desfazer só existe dentro da janela de 30 dias e antes de ser usado. */
  canUndo(batch: { status: string; undoneAt: Date | null; expiresAt: Date }): boolean {
    if (batch.undoneAt) return false;
    if (!["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(batch.status)) return false;
    return batch.expiresAt.getTime() > Date.now();
  }

  /** Apaga o arquivo temporário do lote (chamado depois do processamento). */
  async purgeFile(batchId: string, barbershopId: string): Promise<void> {
    const batch = await this.requireBatch(barbershopId, batchId);
    await deleteTempFile(batch.filePath);
    logger.debug({ batchId }, "Arquivo temporário da importação removido");
  }
}
