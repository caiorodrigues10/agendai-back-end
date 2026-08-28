import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { GetAvatarUploadUrlUseCase } from "./GetAvatarUploadUrlUseCase";
import { ConfirmAvatarUseCase } from "./ConfirmAvatarUseCase";
import { DeleteAvatarUseCase } from "./DeleteAvatarUseCase";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  ALLOWED_LOGO_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  validateMagicBytes,
} from "@/shared/config/upload";

const logger = getModuleLogger("users:avatar");

const ALLOWED_MIME_SET = new Set(Object.keys(ALLOWED_LOGO_MIME_TYPES));

const getUploadUrlSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"], {
    errorMap: () => ({
      message: "mimeType inválido. Aceitos: image/jpeg, image/jpg, image/png, image/webp",
    }),
  }),
});

const confirmAvatarSchema = z.object({
  avatarUrl: z.string().url("avatarUrl deve ser uma URL válida").min(1, "avatarUrl é obrigatória"),
});

export class AvatarController {
  /**
   * GET /users/:id/avatar/upload-url?mimeType=image/jpeg
   */
  async getUploadUrl(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: userId } = request.params as { id: string };
    const { mimeType } = getUploadUrlSchema.parse(request.query);

    const useCase = container.resolve(GetAvatarUploadUrlUseCase);
    const result = await useCase.execute({ userId, mimeType }, request.user!);

    reply.send({
      success: true,
      data: {
        uploadUrl: result.uploadUrl,
        publicUrl: result.publicUrl,
        objectName: result.objectName,
        expiresInSeconds: result.expiresInSeconds,
      },
    });
  }

  /**
   * PATCH /users/:id/avatar
   * Confirms upload from signed URL.
   */
  async confirmAvatar(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: userId } = request.params as { id: string };
    const { avatarUrl } = confirmAvatarSchema.parse(request.body);

    const useCase = container.resolve(ConfirmAvatarUseCase);
    const result = await useCase.execute({ userId, avatarUrl }, request.user!);

    reply.send({
      success: true,
      message: "Foto de perfil atualizada com sucesso",
      data: result,
    });
  }

  /**
   * DELETE /users/:id/avatar
   */
  async deleteAvatar(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: userId } = request.params as { id: string };

    const useCase = container.resolve(DeleteAvatarUseCase);
    await useCase.execute(userId, request.user!);

    reply.status(204).send();
  }

  /**
   * POST /users/:id/avatar/upload
   * Direct multipart upload.
   */
  async uploadDirect(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: userId } = request.params as { id: string };

    const data = await (request as any).file({
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1, fields: 0 },
    });

    if (!data) {
      throw new AppError("Nenhum arquivo enviado. Use o campo 'avatar' no form-data.", 400);
    }

    const mimeType: string = data.mimetype ?? "";
    if (!ALLOWED_MIME_SET.has(mimeType)) {
      await data.toBuffer().catch((err: unknown) => logger.error({ err }, "Failed to drain rejected upload stream"));
      throw new AppError(
        `Tipo de arquivo não permitido: "${mimeType}". Aceitos: JPEG, PNG, WebP`,
        400
      );
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err: any) {
      if (err?.code === "FST_REQ_FILE_TOO_LARGE" || err?.statusCode === 413) {
        throw new AppError("Arquivo muito grande. Máximo permitido: 5 MB", 413);
      }
      throw new AppError(`Erro ao processar o arquivo: ${err?.message ?? "erro desconhecido"}`, 500);
    }

    if (!validateMagicBytes(buffer, mimeType)) {
      throw new AppError(
        `Arquivo corrompido ou tipo inválido: o conteúdo não corresponde a ${mimeType}`,
        400
      );
    }

    // Auth check
    const requestingUser = request.user!;
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      requestingUser.role !== "OWNER" &&
      requestingUser.id !== userId
    ) {
      throw new AppError("Acesso negado: você só pode alterar sua própria foto", 403);
    }

    const { prisma } = await import("@/libs/prismaClient");
    const { randomUUID } = await import("node:crypto");
    const { IStorageProvider } = await import("@/shared/container/providers/StorageProvider/IStorageProvider");

    const storageProvider = container.resolve<IStorageProvider>("StorageProvider");

    // Delete old avatar
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    if (user?.avatarUrl) {
      const oldObjectName = storageProvider.extractObjectName(user.avatarUrl);
      if (oldObjectName) {
        storageProvider.deleteObject(oldObjectName).catch(() => {});
      }
    }

    const ext = ALLOWED_LOGO_MIME_TYPES[mimeType];
    const fileName = `user-${userId}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const uploaded = await storageProvider.uploadBuffer("avatars", fileName, buffer, mimeType);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: uploaded.publicUrl },
      select: { id: true, avatarUrl: true },
    });

    reply.send({
      success: true,
      message: "Foto de perfil enviada com sucesso",
      data: updated,
    });
  }
}
