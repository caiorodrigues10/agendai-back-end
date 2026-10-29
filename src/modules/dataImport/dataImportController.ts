/**
 * Controller do assistente de importação de planilhas.
 *
 * Só valida a entrada (Zod) e resolve o salão — a regra mora nos use cases.
 */
import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { DataImportUseCases } from "./dataImportUseCases";
import { buildImportTemplate } from "./importTemplate";
import { undoImportBatch } from "./importUndo";
import { enqueueDataImportBatch } from "@/shared/infra/queue/dataImportQueue";
import { prisma } from "@/libs/prismaClient";
import {
  configureTargetSchema,
  confirmImportSchema,
  importBatchParamsSchema,
  mappingSchema,
  targetQuerySchema,
} from "./dataImportSchema";

export class DataImportController {
  private useCases = new DataImportUseCases();

  /** Etapa 1 — upload do arquivo. */
  async upload(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const user = request.user!;

    const data = await (request as any).file({
      limits: { files: 1, fields: 5, fileSize: 10 * 1024 * 1024 },
    });

    if (!data) {
      throw new AppError("Nenhum arquivo enviado. Use o campo 'file' no form-data.", 400);
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err: any) {
      const message = String(err?.message ?? "");
      if (message.includes("FST_REQ_FILE_TOO_LARGE") || message.includes("limit")) {
        throw new AppError("O arquivo passa de 10 MB. Envie um arquivo menor.", 413);
      }
      throw new AppError("Não foi possível ler o arquivo enviado.", 400);
    }

    const result = await this.useCases.upload({
      barbershopId,
      userId: user.id,
      fileName: data.filename,
      buffer,
    });

    reply.status(201).send({ success: true, data: result });
  }

  /** Histórico de importações. */
  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const batches = await this.useCases.list(barbershopId);
    reply.send({ success: true, data: batches });
  }

  /** Lote que pode ser retomado. */
  async active(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const batch = await this.useCases.findResumable(barbershopId);
    reply.send({ success: true, data: batch });
  }

  /** Modelo (.xlsx) para download. */
  async template(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const { target } = targetQuerySchema.parse(request.query);

    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { businessSegment: true },
    });

    const { fileName, buffer } = await buildImportTemplate(target, shop?.businessSegment ?? null);

    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buffer);
  }

  /** Etapa 2 — alvo da importação. */
  async configureTarget(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);
    const body = configureTargetSchema.parse(request.body);

    const result = await this.useCases.configureTarget({
      barbershopId,
      batchId,
      targetType: body.targetType,
      sheetName: body.sheetName ?? null,
    });

    reply.send({ success: true, data: result });
  }

  /** Etapa 3 — mapeamento de colunas. */
  async saveMapping(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);
    const body = mappingSchema.parse(request.body);

    const result = await this.useCases.saveMapping({
      barbershopId,
      batchId,
      columns: body.columns,
      options: body.options,
    });

    reply.send({ success: true, data: result });
  }

  /** Etapa 4 — dry-run. */
  async validate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);

    const result = await this.useCases.validate({ barbershopId, batchId });

    reply.send({ success: true, data: result });
  }

  /** Etapa 5 — confirmação: enfileira o processamento. */
  async confirm(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);
    confirmImportSchema.parse(request.body ?? {});

    const result = await this.useCases.confirm({ barbershopId, batchId });

    try {
      await enqueueDataImportBatch(batchId);
    } catch (err) {
      // A fila não aceitou o lote: devolve o estado para o dono confirmar de
      // novo, em vez de deixar o lote travado em "processando".
      await this.useCases.confirmFailed({ barbershopId, batchId });
      throw err;
    }

    reply.send({ success: true, data: result });
  }

  /** Detalhe do lote. */
  async get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);
    const result = await this.useCases.get(barbershopId, batchId);
    reply.send({ success: true, data: result });
  }

  /** Prévia do arquivo (mapeamento). */
  async preview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);
    const result = await this.useCases.preview(barbershopId, batchId);
    reply.send({ success: true, data: result });
  }

  /** CSV com as linhas rejeitadas. */
  async errorsCsv(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);
    const { fileName, content } = await this.useCases.errorsCsv(barbershopId, batchId);

    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(content);
  }

  /** Cancelar um lote abandonado. */
  async cancel(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);
    const result = await this.useCases.cancel({ barbershopId, batchId });
    reply.send({ success: true, data: result });
  }

  /** Desfazer a importação. */
  async undo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, batchId } = importBatchParamsSchema.parse(request.params);
    const result = await undoImportBatch(barbershopId, batchId);
    reply.send({ success: true, data: result });
  }
}

export const dataImportController = new DataImportController();
