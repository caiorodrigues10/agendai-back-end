import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { container } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { ALLOWED_LOGO_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES, validateMagicBytes } from "@/shared/config/upload";

function ensureTenant(request: FastifyRequest, barbershopId: string) {
  const user = request.user!;
  if (user.role !== "MASTER_ADMIN" && user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: mídia não pertence ao seu salão", 403);
  }
}

export class PostMediaController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId } = request.query as { barbershopId: string };
    ensureTenant(request, barbershopId);
    const data = await prisma.postMedia.findMany({ where: { barbershopId }, orderBy: { createdAt: "desc" }, select: { id: true, url: true, mimeType: true, size: true, createdAt: true } });
    return reply.send({ success: true, data });
  }

  async upload(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId } = request.params as { barbershopId: string };
    ensureTenant(request, barbershopId);
    const data = await (request as any).file({ limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1, fields: 0 } });
    if (!data) throw new AppError("Nenhuma imagem enviada.", 400);
    const mimeType = String(data.mimetype ?? "");
    const extension = ALLOWED_LOGO_MIME_TYPES[mimeType];
    if (!extension) throw new AppError("Formato inválido. Envie JPG, PNG ou WebP.", 400);
    const buffer = await data.toBuffer();
    if (!validateMagicBytes(buffer, mimeType)) throw new AppError("A imagem parece corrompida.", 400);
    const storage = container.resolve<IStorageProvider>("StorageProvider");
    const uploaded = await storage.uploadBuffer("posts-media", `media-${barbershopId}-${randomUUID()}.${extension}`, buffer, mimeType);
    const media = await prisma.postMedia.create({ data: { barbershopId, uploadedById: request.user!.id, url: uploaded.publicUrl, objectName: uploaded.objectName, mimeType, size: buffer.byteLength }, select: { id: true, url: true, mimeType: true, size: true, createdAt: true } });
    return reply.status(201).send({ success: true, data: media });
  }

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const media = await prisma.postMedia.findUnique({ where: { id } });
    if (!media) throw new AppError("Imagem não encontrada.", 404);
    ensureTenant(request, media.barbershopId);
    const inUse = await prisma.feedPost.count({ where: { OR: [{ primaryMediaId: id }, { secondaryMediaId: id }], status: { notIn: ["PUBLISHED"] } } });
    if (inUse > 0) throw new AppError("Remova a imagem dos rascunhos ou posts agendados antes de excluir.", 409);
    await container.resolve<IStorageProvider>("StorageProvider").deleteObject(media.objectName);
    await prisma.postMedia.delete({ where: { id } });
    return reply.send({ success: true });
  }
}
