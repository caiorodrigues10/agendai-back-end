/**
 * Controller da exportação de planilhas.
 *
 * Só valida a entrada (Zod) e resolve o salão — a regra mora nos use cases.
 * O download é servido por esta rota (autenticado): não existe URL pública.
 */
import { FastifyRequest, FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { AppError } from "@/shared/errors/AppError";
import { dataExportUseCases } from "./dataExportUseCases";
import { createExportSchema, exportJobParamsSchema } from "./dataExportSchema";
import { enqueueDataExport } from "@/shared/infra/queue/dataExportQueue";

export class DataExportController {
  /** Cria o pedido e enfileira a geração. */
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const user = request.user!;
    const body = createExportSchema.parse(request.body);

    const job = await dataExportUseCases.create({
      barbershopId,
      userId: user.id,
      periodPreset: body.periodPreset,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      modules: body.modules,
      preset: body.preset,
      format: body.format,
      options: body.options,
    });

    // Pedido novo (não reaproveitado) → enfileira.
    if (job.status === "PENDING") {
      await enqueueDataExport(job.id, barbershopId);
    }

    reply.status(201).send({ success: true, data: job });
  }

  /** Histórico de exportações. */
  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const jobs = await dataExportUseCases.list(barbershopId);
    reply.send({ success: true, data: jobs });
  }

  /** Detalhe de um pedido (com progresso). */
  async get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, exportId } = exportJobParamsSchema.parse(request.params);
    const job = await dataExportUseCases.get(barbershopId, exportId);
    reply.send({ success: true, data: job });
  }

  /** Baixa o arquivo (autenticado, com expiração). */
  async download(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, exportId } = exportJobParamsSchema.parse(request.params);
    const job = await dataExportUseCases.getDownloadable(barbershopId, exportId);

    reply
      .header(
        "Content-Type",
        job.format === "CSV_ZIP"
          ? "application/zip"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .header("Content-Disposition", `attachment; filename="${job.fileName ?? "exportacao"}"`)
      .header("Cache-Control", "private, no-store");

    const stream = createReadStream(job.filePath!);
    stream.on("error", () => {
      reply.code(500).send({ success: false, message: "Não foi possível ler o arquivo." });
    });
    return reply.send(stream);
  }

  /** Exclui o arquivo antes da expiração. */
  async remove(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, exportId } = exportJobParamsSchema.parse(request.params);
    const result = await dataExportUseCases.remove(barbershopId, exportId);
    reply.send({ success: true, data: result });
  }
}

export const dataExportController = new DataExportController();
