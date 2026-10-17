import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";

export interface IDeleteImageAssetParams {
  /** Cloudinary (ImageStorageProvider) — usado para publicId explícito e URLs res.cloudinary.com. */
  imageProvider: IStorageProvider;
  /** Legado GCS (StorageProvider / Fallback) — só para URLs de bucket antigo. */
  legacyProvider: IStorageProvider;
  /** public_id do Cloudinary conhecido (logoPublicId / coverPublicId), quando existir. */
  publicId?: string | null;
  /** URL pública gravada no banco (Cloudinary ou GCS legado). */
  publicUrl?: string | null;
  /** Contexto para o log de warning (ex: "DeleteAvatar"). */
  context?: string;
}

/**
 * Deleta um asset de imagem roteando pelo provider de origem:
 *   - publicId conhecido ou URL do Cloudinary → ImageStorageProvider;
 *   - URL do GCS legado → StorageProvider (fallback);
 *   - sem nada reconhecível → no-op.
 * Idempotente e best-effort: falhas viram warning, nunca derrubam o fluxo principal.
 */
export async function deleteImageAsset(params: IDeleteImageAssetParams): Promise<void> {
  const { imageProvider, legacyProvider, publicId, publicUrl, context } = params;
  const label = context ? `[${context}] ` : "";

  try {
    if (publicId) {
      await imageProvider.deleteObject(publicId);
      return;
    }
    if (!publicUrl) return;

    const cloudinaryName = imageProvider.extractObjectName(publicUrl);
    if (cloudinaryName) {
      await imageProvider.deleteObject(cloudinaryName);
      return;
    }

    const legacyName = legacyProvider.extractObjectName(publicUrl);
    if (legacyName) {
      await legacyProvider.deleteObject(legacyName);
    }
  } catch (err) {
    console.warn(
      `${label}Falha ao deletar asset de imagem (${publicId ?? publicUrl ?? "?"}):`,
      (err as Error)?.message,
    );
  }
}
