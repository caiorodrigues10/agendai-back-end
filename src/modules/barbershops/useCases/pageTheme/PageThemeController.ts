import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  ALLOWED_LOGO_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  validateMagicBytes,
} from "@/shared/config/upload";
import { COVER_IMAGE_SPEC } from "@/shared/constants/imageSpecs";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  pageThemeIdParamsSchema,
  updatePageThemeBodySchema,
} from "../../schemas/pageThemeSchemas";
import { GetPageThemeUseCase } from "./GetPageThemeUseCase";
import { UpdatePageThemeUseCase } from "./UpdatePageThemeUseCase";
import { UploadPageThemeCoverUseCase } from "./UploadPageThemeCoverUseCase";
import { DeletePageThemeCoverUseCase } from "./DeletePageThemeCoverUseCase";

const logger = getModuleLogger("barbershops:page-theme");

const ALLOWED_MIME_SET = new Set(Object.keys(ALLOWED_LOGO_MIME_TYPES));

export class PageThemeController {
  async getPublic(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = pageThemeIdParamsSchema.parse(request.params);
    const useCase = container.resolve(GetPageThemeUseCase);
    const theme = await useCase.execute(id);
    reply.header("Cache-Control", "public, max-age=60");
    reply.send({ success: true, data: theme });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = pageThemeIdParamsSchema.parse(request.params);
    const body = updatePageThemeBodySchema.parse(request.body);
    const useCase = container.resolve(UpdatePageThemeUseCase);
    const theme = await useCase.execute(id, body, request.user!);
    reply.send({ success: true, data: theme });
  }

  async uploadCover(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = pageThemeIdParamsSchema.parse(request.params);

    const data = await (request as any).file({
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1, fields: 0 },
    });
    if (!data) {
      throw new AppError("Nenhum arquivo enviado. Use o campo 'cover' no form-data.", 400);
    }

    const mimeType: string = data.mimetype ?? "";
    if (!ALLOWED_MIME_SET.has(mimeType)) {
      await data
        .toBuffer()
        .catch((err: unknown) => logger.error({ err }, "Failed to drain rejected upload stream"));
      throw new AppError(
        `Tipo de arquivo não permitido: "${mimeType}". Aceitos: JPEG, PNG, WebP`,
        400,
      );
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err: any) {
      if (err?.code === "FST_REQ_FILE_TOO_LARGE" || err?.statusCode === 413) {
        throw new AppError(
          `Arquivo muito grande. Máximo permitido: ${COVER_IMAGE_SPEC.maxBytes / 1024 / 1024} MB`,
          413,
        );
      }
      throw new AppError(`Erro ao processar o arquivo: ${err?.message ?? "erro desconhecido"}`, 500);
    }

    if (!validateMagicBytes(buffer, mimeType)) {
      throw new AppError(
        `Arquivo corrompido ou tipo inválido: o conteúdo não corresponde a ${mimeType}`,
        400,
      );
    }

    const useCase = container.resolve(UploadPageThemeCoverUseCase);
    const theme = await useCase.execute(
      { barbershopId: id, buffer, mimeType, originalName: data.filename },
      request.user!,
    );

    reply.send({ success: true, message: "Capa enviada com sucesso", data: theme });
  }

  async deleteCover(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = pageThemeIdParamsSchema.parse(request.params);
    const useCase = container.resolve(DeletePageThemeCoverUseCase);
    const theme = await useCase.execute(id, request.user!);
    reply.send({ success: true, data: theme });
  }
}
