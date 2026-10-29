/**
 * Use cases do assistente de importação de planilhas.
 *
 * O fluxo tem 7 etapas e cada etapa é uma operação idempotente:
 *   1. upload        — o arquivo entra e é lido (cabeçalhos + prévia);
 *   2. alvo          — o dono escolhe o que importar (clientes/serviços/agenda);
 *   3. mapa          — o dono ajusta o mapeamento de colunas;
 *   4. validação    — dry-run: mostra o que entra e o que é rejeitado;
 *   5. prévia       — o dono confirma;
 *   6. conclusão    — a fila processa o lote;
 *   7. histórico    — o dono vê o resultado e pode desfazer (30 dias).
 *
 * O estado do lote vive no banco: o dono pode sair da tela e voltar depois.
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
  MAX_ACTIVE_IMPORT_BATCHES,
  MAX_IMPORT_BATCHES_PER_HOUR,
} from "./dataImport.constants";
import type {
  ImportFieldKey,
  ImportOptions,
  ImportTargetType,
  RowValidationResult,
  ValidationSummary,
} from "./dataImport.types";
import { ImportBatchRepository } from "./repositories/ImportBatchRepository";
import { ImportRowResultRepository } from "./repositories/ImportRowResultRepository";
import { ImportCreatedEntityRepository } from "./repositories/ImportCreatedEntityRepository";
import { validateImportFile } from "./utils/fileValidation";
import { readSpreadsheet, readSpreadsheetPreview } from "./utils/spreadsheetParser";
import {
  availableFields,
  detectColumns,
  getFieldLabel,
  invertColumnMapping,
  toColumnMap,
} from "./utils/columnMapping";
import { validateRow } from "./utils/rowValidator";
import { deleteTempFile, saveTempFile } from "./utils/tempFiles";
import { buildErrorCsv } from "./utils/sanitize";
import { requestContext } from "@/shared/infra/http/requestContext";

const logger = getModuleLogger("data-import");

/** Formato do lote salvo no banco (mapa + opções). */
interface StoredMapping {
  columns: Record<string, string>;
  options: ImportOptions;
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
      const parsed = await readSpreadsheet(filePath, validated.format);

      const expiresAt = new Date(Date.now() + IMPORT_UNDO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const batch = await this.batches.create({
        barbershopId,
        fileName: validated.fileName,
        filePath,
        fileSize: validated.fileSize,
        fileFormat: validated.format,
        sheetName: parsed.selectedSheet,
        targetType: "CLIENTS",
        headers: parsed.headers,
        createdById: userId ?? null,
        expiresAt,
      });

      return {
        id: batch.id,
        fileName: batch.fileName,
        fileFormat: batch.fileFormat,
        targetType: batch.targetType,
        status: batch.status,
        sheetNames: parsed.sheetNames,
        selectedSheet: parsed.selectedSheet,
        headers: parsed.headers,
        preview: parsed.rows.slice(0, 20),
        totalRows: parsed.rows.length,
        createdAt: batch.createdAt,
        expiresAt: batch.expiresAt,
      };
    } catch (err) {
      await deleteTempFile(filePath);
      throw err;
    }
  }

  /** Etapa 2 — dono escolhe o alvo (e a aba, quando a planilha tem várias). */
  async configureTarget(params: {
    barbershopId: string;
    batchId: string;
    targetType: ImportTargetType;
    sheetName?: string | null;
  }) {
    const batch = await this.requireBatch(params.barbershopId, params.batchId);
    if (batch.status === "PROCESSING") {
      throw new AppError("Este lote já está sendo processado.", 409);
    }
    if (batch.status === "UNDONE") {
      throw new AppError("Este lote já foi desfeito.", 409);
    }

    const sheetName = params.sheetName ?? batch.sheetName ?? null;
    const parsed = await readSpreadsheet(batch.filePath, batch.fileFormat, sheetName);

    const segment = await this.resolveSegment(params.barbershopId);
    const detected = detectColumns(parsed.headers, params.targetType, segment);

    await this.batches.update(batch.id, params.barbershopId, {
      targetType: params.targetType,
      sheetName: parsed.selectedSheet,
      headers: parsed.headers,
      status: "MAPPING",
    });

    return {
      id: batch.id,
      targetType: params.targetType,
      status: "MAPPING" as const,
      sheetNames: parsed.sheetNames,
      selectedSheet: parsed.selectedSheet,
      headers: parsed.headers,
      fields: this.describeFields(params.targetType, segment),
      detectedColumns: detected,
      preview: parsed.rows.slice(0, 20),
      totalRows: parsed.rows.length,
    };
  }

  /** Etapa 3 — dono ajusta o mapeamento e as opções. */
  async saveMapping(params: {
    barbershopId: string;
    batchId: string;
    columns: Record<string, string>;
    options?: Partial<ImportOptions>;
  }) {
    const batch = await this.requireBatch(params.barbershopId, params.batchId);
    if (batch.status === "PROCESSING") {
      throw new AppError("Este lote já está sendo processado.", 409);
    }

    const segment = await this.resolveSegment(params.barbershopId);
    const columnMap = invertColumnMapping(params.columns);
    const fields = availableFields(batch.targetType, segment);
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
      throw new AppError(
        `Falta mapear: ${missing.join(", ")}. Ajuste o mapa antes de continuar.`,
        400,
      );
    }

    const options: ImportOptions = {
      ...DEFAULT_IMPORT_OPTIONS,
      ...(params.options ?? {}),
    };

    const stored: StoredMapping = { columns: toColumnMap(columnMap), options };
    await this.batches.update(batch.id, params.barbershopId, {
      mapping: stored,
      status: "MAPPING",
    });

    return { id: batch.id, status: "MAPPING" as const, mapping: stored };
  }

  /** Etapa 4 — dry-run. Não escreve nada no banco. */
  async validate(params: { barbershopId: string; batchId: string }): Promise<ValidationSummary> {
    const batch = await this.requireBatch(params.barbershopId, params.batchId);
    const mapping = this.readMapping(batch);
    const segment = await this.resolveSegment(params.barbershopId);

    const parsed = await readSpreadsheet(batch.filePath, batch.fileFormat, batch.sheetName);
    const context = this.buildContext(parsed.headers, mapping, segment);

    await this.batches.update(batch.id, params.barbershopId, {
      status: "VALIDATING",
      totalRows: parsed.rows.length,
    });

    try {
      const results: RowValidationResult[] = [];
      let validRows = 0;
      let failedRows = 0;
      let skippedRows = 0;

      await requestContext.run({ barbershopId: params.barbershopId }, async () => {
        for (let index = 0; index < parsed.rows.length; index += 1) {
          const rowNumber = index + 1;
          const result = await validateRow(
            prisma,
            params.barbershopId,
            parsed.rows[index],
            context,
            batch.targetType,
            rowNumber,
          );
          if (result.status === "VALID") validRows += 1;
          else if (result.status === "SKIPPED") skippedRows += 1;
          else failedRows += 1;
          results.push(result);
        }
      });

      await this.batches.update(batch.id, params.barbershopId, {
        status: "AWAITING_CONFIRMATION",
        totalRows: parsed.rows.length,
      });

      return {
        totalRows: parsed.rows.length,
        validRows,
        skippedRows,
        failedRows,
        results,
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
  async cancel(params: { barbershopId: string; batchId: string }) {    const batch = await this.requireBatch(params.barbershopId, params.batchId);
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

    const mapping = this.readMapping(batch);
    const segment = await this.resolveSegment(params.barbershopId);
    const parsed = await readSpreadsheet(batch.filePath, batch.fileFormat, batch.sheetName);

    // A validação precisa ter rodado (ou as colunas obrigatórias estão
    // mapeadas) antes de confirmar.
    this.buildContext(parsed.headers, mapping, segment);

    await this.batches.update(batch.id, params.barbershopId, {
      status: "PROCESSING",
      totalRows: parsed.rows.length,
      startedAt: new Date(),
      errorMessage: null,
    });

    return { id: batch.id, status: "PROCESSING" as const, totalRows: parsed.rows.length };
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

    return {
      ...this.toSummary(batch),
      mapping: batch.mapping,
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
    const parsed = await readSpreadsheetPreview(batch.filePath, batch.fileFormat, batch.sheetName, 20);
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

  private readMapping(batch: { mapping: unknown }): StoredMapping {
    const stored = batch.mapping as StoredMapping | null;
    if (!stored || !stored.columns || !stored.options) {
      throw new AppError("Mapeie as colunas da planilha antes de continuar.", 400);
    }
    return stored;
  }

  private buildContext(
    headers: string[],
    mapping: StoredMapping,
    segment: BusinessSegment | null,
  ) {
    const columnMap = new Map<ImportFieldKey, number>();
    for (const [column, field] of Object.entries(mapping.columns)) {
      const index = Number(column);
      if (Number.isInteger(index) && index >= 0) {
        columnMap.set(field as ImportFieldKey, index);
      }
    }
    return { headers, columnMap, options: mapping.options, segment };
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
