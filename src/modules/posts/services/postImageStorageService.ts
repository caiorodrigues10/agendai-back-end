import { randomUUID } from "node:crypto";
import { container } from "tsyringe";
import type { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("posts:imageStorage");

/** Pasta no Cloudinary onde a arte final dos posts é guardada. */
export const POST_ART_FOLDER = "posts-art";

/** Sanidade: data-URL maior que isso é payload absurdo para uma arte de post. */
const MAX_ART_BYTES = 15 * 1024 * 1024;

/** Extensão de arquivo por subtipo aceito (o public_id do Cloudinary não usa ext). */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

function resolveStorage(): IStorageProvider {
  return container.resolve<IStorageProvider>("ImageStorageProvider");
}

function decodeArtDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new AppError("Imagem inválida: data-URL malformada", 400);

  const mimeType = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) throw new AppError("Formato de imagem não suportado. Use PNG, JPEG ou WebP.", 400);

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length === 0) throw new AppError("Imagem inválida: conteúdo vazio", 400);
  if (buffer.length > MAX_ART_BYTES) throw new AppError("Imagem muito grande (máximo 15MB)", 400);

  return { buffer, mimeType };
}

export type PersistedPostImage = {
  /** URL pública a gravar em `FeedPost.imageUrl`. */
  imageUrl: string;
  /** public_id no Cloudinary (`posts-art/...`) — null quando não há asset novo. */
  imageAssetName: string | null;
};

/**
 * Persiste a arte final gerada de um post no Cloudinary (pasta `posts-art`).
 *
 * - Data-URL (`data:image/...;base64,...`) → upload → URL pública + assetName.
 * - Qualquer outra entrada (URL http legada/externa) passa adiante sem upload
 *   e com `imageAssetName: null` — não há asset a compensar/destruir.
 * - Falha de upload lança AppError (502) — o chamador NUNCA deve regravar o
 *   base64 no banco como fallback.
 */
export async function persistPostImage(
  barbershopId: string,
  imageUrl: string,
): Promise<PersistedPostImage> {
  if (!imageUrl.startsWith("data:")) {
    return { imageUrl, imageAssetName: null };
  }
  if (!imageUrl.startsWith("data:image/")) {
    throw new AppError("Imagem inválida: esperada data-URL de imagem", 400);
  }

  const { buffer, mimeType } = decodeArtDataUrl(imageUrl);
  const storage = resolveStorage();

  try {
    const uploaded = await storage.uploadBuffer(
      POST_ART_FOLDER,
      storageFileName(barbershopId, mimeType),
      buffer,
      mimeType,
    );
    return { imageUrl: uploaded.publicUrl, imageAssetName: uploaded.objectName };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ barbershopId, err: message }, "Falha ao subir arte do post p/ Cloudinary");
    throw new AppError("Não foi possível salvar a imagem do post. Tente novamente.", 502);
  }
}

function storageFileName(barbershopId: string, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType];
  const tenant = barbershopId.replace(/[^a-zA-Z0-9-]/g, "");
  return `${tenant}/${randomUUID()}.${ext}`;
}

/**
 * Remove um asset de arte do post. Best-effort: falha de limpeza é logada e
 * nunca propaga (não pode derrubar salvar/deletar post).
 * `null` (legado base64/URL externa) é no-op.
 */
export async function deletePostImage(assetName: string | null | undefined): Promise<void> {
  if (!assetName) return;
  try {
    await resolveStorage().deleteObject(assetName);
  } catch (err) {
    logger.warn({ assetName, err: err instanceof Error ? err.message : String(err) }, "Falha ao remover arte do post do storage (asset órfão possible)");
  }
}
