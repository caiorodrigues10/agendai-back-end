import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { GetLogoUploadUrlUseCase } from "./GetLogoUploadUrlUseCase";
import { ConfirmLogoUseCase } from "./ConfirmLogoUseCase";
import { DeleteLogoUseCase } from "./DeleteLogoUseCase";
import { UploadLogoDirectUseCase } from "./UploadLogoDirectUseCase";
import { AppError } from "@/shared/errors/AppError";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const getUploadUrlSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"], {
    errorMap: () => ({
      message: "mimeType inválido. Aceitos: image/jpeg, image/jpg, image/png, image/webp",
    }),
  }),
});

const confirmLogoSchema = z.object({
  logoUrl: z
    .string()
    .url("logoUrl deve ser uma URL válida")
    .min(1, "logoUrl é obrigatória"),
});

export class LogoController {
  /**
   * GET /barbershops/:id/logo/upload-url
   * Retorna uma signed URL para upload direto no GCS (sem passar pelo backend).
   * Query param: mimeType=image/jpeg|image/png|image/webp
   *
   * Fluxo:
   *   1. GET /barbershops/:id/logo/upload-url?mimeType=image/jpeg
   *   2. PUT {uploadUrl} com o arquivo (header Content-Type: image/jpeg)
   *   3. PATCH /barbershops/:id/logo com { logoUrl: publicUrl }
   */
  async getUploadUrl(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };
    const { mimeType } = getUploadUrlSchema.parse(request.query);

    const useCase = container.resolve(GetLogoUploadUrlUseCase);
    const result = await useCase.execute({ barbershopId, mimeType }, request.user!);

    reply.send({
      success: true,
      data: {
        uploadUrl:        result.uploadUrl,
        publicUrl:        result.publicUrl,
        objectName:       result.objectName,
        expiresInSeconds: result.expiresInSeconds,
        instructions: [
          `1. Faça PUT para uploadUrl com o header Content-Type: ${mimeType}`,
          "2. Após o upload bem-sucedido (HTTP 200), chame PATCH /barbershops/:id/logo com { logoUrl: publicUrl }",
        ],
      },
    });
  }

  /**
   * POST /barbershops/:id/logo/upload
   * Upload direto via multipart/form-data (Fastify multipart).
   * Campo do arquivo: "logo"
   *
   * Fluxo simplificado (uma única requisição):
   *   POST /barbershops/:id/logo/upload
   *   Content-Type: multipart/form-data
   *   Body: form-data com campo "logo" (arquivo)
   */
  async uploadDirect(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };

    // Lê o arquivo via @fastify/multipart
    const data = await (request as any).file({
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
        fields: 0,
      },
    });

    if (!data) {
      throw new AppError("Nenhum arquivo enviado. Use o campo 'logo' no form-data.", 400);
    }

    const mimeType: string = data.mimetype ?? "";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      // Drena o stream para não deixar a conexão pendurada
      await data.toBuffer().catch(() => {});
      throw new AppError(
        `Tipo de arquivo não permitido: "${mimeType}". Aceitos: JPEG, PNG, WebP`,
        400
      );
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err: any) {
      // @fastify/multipart lança RequestFileTooLargeError quando ultrapassa o limite
      if (err?.code === "FST_REQ_FILE_TOO_LARGE" || err?.statusCode === 413) {
        throw new AppError("Arquivo muito grande. Máximo permitido: 5 MB", 413);
      }
      throw new AppError(`Erro ao processar o arquivo: ${err?.message ?? "erro desconhecido"}`, 500);
    }

    const useCase = container.resolve(UploadLogoDirectUseCase);
    const barbershop = await useCase.execute(
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
      message: "Logo enviada com sucesso",
      data: {
        id:      barbershop.id,
        logoUrl: barbershop.logoUrl,
      },
    });
  }

  /**
   * PATCH /barbershops/:id/logo
   * Confirma o upload (da signed URL) salvando a URL pública no banco.
   * Body: { logoUrl: string }
   */
  async confirmLogo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };
    const { logoUrl } = confirmLogoSchema.parse(request.body);

    const useCase = container.resolve(ConfirmLogoUseCase);
    const barbershop = await useCase.execute({ barbershopId, logoUrl }, request.user!);

    reply.send({
      success: true,
      message: "Logo atualizada com sucesso",
      data: { id: barbershop.id, logoUrl: barbershop.logoUrl },
    });
  }

  /**
   * DELETE /barbershops/:id/logo
   * Remove a logo do GCS e limpa o campo no banco.
   */
  async deleteLogo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };

    const useCase = container.resolve(DeleteLogoUseCase);
    await useCase.execute(barbershopId, request.user!);

    reply.status(204).send();
  }
}
