import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { GetLogoUploadUrlUseCase } from "./GetLogoUploadUrlUseCase";
import { ConfirmLogoUseCase } from "./ConfirmLogoUseCase";
import { DeleteLogoUseCase } from "./DeleteLogoUseCase";

const getUploadUrlSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png"], {
    errorMap: () => ({
      message: "mimeType inválido. Aceitos: image/jpeg, image/jpg, image/png",
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
   * Retorna uma signed URL para upload direto no GCS.
   * Query param: mimeType=image/jpeg|image/png
   */
  async getUploadUrl(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };
    const { mimeType } = getUploadUrlSchema.parse(request.query);

    const useCase = container.resolve(GetLogoUploadUrlUseCase);
    const result = await useCase.execute(
      { barbershopId, mimeType },
      request.user!
    );

    reply.send({
      success: true,
      data: {
        uploadUrl: result.uploadUrl,
        publicUrl: result.publicUrl,
        objectName: result.objectName,
        expiresInSeconds: result.expiresInSeconds,
        instructions: [
          `1. Faça PUT para uploadUrl com o header Content-Type: ${mimeType}`,
          "2. Após o upload bem-sucedido (HTTP 200), chame PATCH /barbershops/:id/logo com { logoUrl: publicUrl }",
        ],
      },
    });
  }

  /**
   * PATCH /barbershops/:id/logo
   * Confirma o upload salvando a URL pública no banco.
   * Body: { logoUrl: string }
   */
  async confirmLogo(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };
    const { logoUrl } = confirmLogoSchema.parse(request.body);

    const useCase = container.resolve(ConfirmLogoUseCase);
    const barbershop = await useCase.execute(
      { barbershopId, logoUrl },
      request.user!
    );

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
  async deleteLogo(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };

    const useCase = container.resolve(DeleteLogoUseCase);
    await useCase.execute(barbershopId, request.user!);

    reply.status(204).send();
  }
}