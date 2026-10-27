import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { container } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { ALLOWED_LOGO_MIME_TYPES, validateMagicBytes } from "@/shared/config/upload";
import { POST_MEDIA_MAX_BYTES } from "@/shared/constants/imageSpecs";
import { listMediaQuerySchema, updateMediaBodySchema } from "../schemas/postsSchemas";

/** Limite de fotos na galeria pública do salão (perfil "Fotos"). */
export const GALLERY_MAX_PHOTOS = 30;

/** Lado máximo preservado no upload (transformação de entrada do Cloudinary). */
const UPLOAD_MAX_WIDTH = 2000;

/**
 * Transformação de entrada: limita resolução/peso no próprio upload
 * (`c_limit,w_2000` + `q_auto`). Fotos maiores chegam comprimidas ao Cloudinary.
 */
const UPLOAD_TRANSFORMATION = [{ width: UPLOAD_MAX_WIDTH, crop: "limit", quality: "auto" }];

const UPLOAD_MAX_MB = Math.round(POST_MEDIA_MAX_BYTES / (1024 * 1024));

/**
 * Adiciona `f_auto,q_auto` na URL de entrega do Cloudinary (perfil/galeria).
 * A URL salva no banco permanece "limpa" — a deleção usa o objectName original.
 * URLs não-Cloudinary (GCS legado) retornam intactas.
 */
export function withCloudinaryDelivery(url: string): string {
  return url.replace(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload)\//, "$1/f_auto,q_auto/");
}

const mediaSelect = { id: true, url: true, mimeType: true, size: true, createdAt: true, inGallery: true } as const;

function toMediaDto(media: { id: string; url: string; mimeType: string; size: number; createdAt: Date; inGallery: boolean }) {
  return { ...media, url: withCloudinaryDelivery(media.url) };
}

function ensureTenant(request: FastifyRequest, barbershopId: string) {
  const user = request.user!;
  if (user.role !== "MASTER_ADMIN" && user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: mídia não pertence ao seu salão", 403);
  }
}

/** Mapeia falhas do storage (ex.: Cloudinary "Invalid image file"/"Failed to ping image") p/ 400 amigável. */
function mapStorageError(err: unknown): never {
  if (err instanceof AppError) throw err;
  const message = err instanceof Error ? err.message : String(err);
  const httpCode = (err as { http_code?: number } | null)?.http_code;
  if (httpCode === 400 || /invalid image|not a valid|corrupt|decode|failed to ping/i.test(message)) {
    throw new AppError("A imagem parece inválida ou corrompida.", 400);
  }
  throw new AppError("Não foi possível enviar a imagem ao servidor de fotos. Tente novamente.", 502);
}

/** Limite da galeria pública do salão (perfil "Fotos"), verificado antes do upload. */
async function assertGalleryCapacity(barbershopId: string) {
  const count = await prisma.postMedia.count({ where: { barbershopId, inGallery: true } });
  if (count >= GALLERY_MAX_PHOTOS) {
    throw new AppError(`Sua galeria já tem ${GALLERY_MAX_PHOTOS} fotos. Remova uma foto para enviar outra.`, 400);
  }
}

export class PostMediaController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId, inGallery } = listMediaQuerySchema.parse(request.query);
    ensureTenant(request, barbershopId);
    const rows = await prisma.postMedia.findMany({
      where: { barbershopId, ...(inGallery === undefined ? {} : { inGallery: inGallery === "true" }) },
      orderBy: { createdAt: "desc" },
      select: mediaSelect,
    });
    return reply.send({ success: true, data: rows.map(toMediaDto) });
  }

  async upload(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId } = request.params as { barbershopId: string };
    ensureTenant(request, barbershopId);
    let fileData: { mimetype: string; buffer: Buffer } | null = null;
    try {
      // fileSize por rota: mesmo limite do front (POST_MEDIA_MAX_BYTES). O
      // registro global do multipart não define fileSize p/ não quebrar outros
      // uploads (ex.: vídeo de 25 MB).
      for await (const part of request.parts({ limits: { files: 1, fields: 2, fileSize: POST_MEDIA_MAX_BYTES } })) {
        if (part.type === "file") {
          fileData = { mimetype: String(part.mimetype ?? ""), buffer: await part.toBuffer() };
        }
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "FST_REQ_FILE_TOO_LARGE" || (err as { name?: string }).name === "RequestFileTooLargeError") {
        throw new AppError(`Imagem deve ter no máximo ${UPLOAD_MAX_MB} MB.`, 413);
      }
      throw err;
    }
    if (!fileData) throw new AppError("Nenhuma imagem enviada.", 400);
    const mimeType = fileData.mimetype;
    const extension = ALLOWED_LOGO_MIME_TYPES[mimeType];
    if (!extension) throw new AppError("Formato inválido. Envie JPG, PNG ou WebP.", 415);
    const buffer = fileData.buffer;
    if (!validateMagicBytes(buffer, mimeType)) throw new AppError("A imagem parece inválida ou corrompida.", 400);
    // Limite da galeria verificado ANTES do upload ao storage: quando a galeria
    // está cheia nada é enviado ao Cloudinary (sem arquivo órfão).
    await assertGalleryCapacity(barbershopId);
    const storage = container.resolve<IStorageProvider>("ImageStorageProvider");
    let uploaded;
    try {
      uploaded = await storage.uploadBuffer("posts-media", `media-${barbershopId}-${randomUUID()}.${extension}`, buffer, mimeType, {
        transformation: UPLOAD_TRANSFORMATION,
      });
    } catch (err) {
      mapStorageError(err);
    }
    // Toda foto enviada entra na galeria pública do perfil (aba "Fotos").
    const media = await prisma.postMedia.create({
      data: { barbershopId, uploadedById: request.user!.id, url: uploaded.publicUrl, objectName: uploaded.objectName, mimeType, size: buffer.byteLength, inGallery: true },
      select: mediaSelect,
    });
    return reply.status(201).send({ success: true, data: toMediaDto(media) });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { inGallery } = updateMediaBodySchema.parse(request.body);
    const media = await prisma.postMedia.findUnique({ where: { id } });
    if (!media) throw new AppError("Imagem não encontrada.", 404);
    ensureTenant(request, media.barbershopId);
    if (inGallery && !media.inGallery) await assertGalleryCapacity(media.barbershopId);
    const data = await prisma.postMedia.update({ where: { id }, data: { inGallery }, select: mediaSelect });
    return reply.send({ success: true, data: toMediaDto(data) });
  }

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const media = await prisma.postMedia.findUnique({ where: { id } });
    if (!media) throw new AppError("Imagem não encontrada.", 404);
    ensureTenant(request, media.barbershopId);
    const inUse = await prisma.feedPost.count({ where: { OR: [{ primaryMediaId: id }, { secondaryMediaId: id }], status: { notIn: ["PUBLISHED"] } } });
    if (inUse > 0) throw new AppError("Remova a imagem dos rascunhos ou posts agendados antes de excluir.", 409);
    // Roteia pela origem do asset: URL do Cloudinary → ImageStorageProvider; GCS legado → StorageProvider
    const { deleteImageAsset } = await import("@/shared/utils/imageAssetDeletion");
    await deleteImageAsset({
      imageProvider: container.resolve<IStorageProvider>("ImageStorageProvider"),
      legacyProvider: container.resolve<IStorageProvider>("StorageProvider"),
      publicUrl: media.url,
      context: "PostMediaRemove",
    });
    await prisma.postMedia.delete({ where: { id } });
    return reply.send({ success: true });
  }
}
