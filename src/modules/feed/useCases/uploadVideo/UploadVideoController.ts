import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { UploadVideoUseCase } from "./UploadVideoUseCase";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
  validateVideoMagicBytes,
} from "@/shared/config/upload";

const logger = getModuleLogger("feed:uploadVideo");

const ALLOWED_MIME_SET = new Set(Object.keys(ALLOWED_VIDEO_MIME_TYPES));

export class UploadVideoController {
  async upload(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = await (request as any).file({
      limits: {
        fileSize: MAX_VIDEO_SIZE_BYTES,
        files: 1,
        fields: 0,
      },
    });

    if (!data) {
      throw new AppError("Nenhum arquivo enviado. Use o campo 'video' no form-data.", 400);
    }

    const mimeType: string = data.mimetype ?? "";
    if (!ALLOWED_MIME_SET.has(mimeType)) {
      await data.toBuffer().catch((err: unknown) =>
        logger.error({ err }, "Failed to drain rejected upload stream")
      );
      throw new AppError(
        `Tipo de arquivo não permitido: "${mimeType}". Aceitos: MP4, WebM, MOV`,
        400
      );
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err: any) {
      if (err?.code === "FST_REQ_FILE_TOO_LARGE" || err?.statusCode === 413) {
        throw new AppError("Arquivo muito grande. Máximo permitido: 25 MB", 413);
      }
      throw new AppError(
        `Erro ao processar o arquivo: ${err?.message ?? "erro desconhecido"}`,
        500
      );
    }

    if (!validateVideoMagicBytes(buffer, mimeType)) {
      throw new AppError(
        `Arquivo corrompido ou tipo inválido: o conteúdo não corresponde a ${mimeType}`,
        400
      );
    }

    const useCase = container.resolve(UploadVideoUseCase);
    const { barbershopId } = request.params as { barbershopId: string };

    const result = await useCase.execute(
      {
        barbershopId,
        buffer,
        mimeType,
        originalName: data.filename,
      },
      request.user!
    );

    reply.send({
      success: true,
      data: { videoUrl: result.videoUrl },
    });
  }
}
