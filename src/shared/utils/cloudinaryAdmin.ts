import { AppError } from "@/shared/errors/AppError";

type CloudinaryV2 = typeof import("cloudinary").v2;

const CLOUDINARY_SETUP_HINT =
  "Configure o Cloudinary: veja docs/CLOUDINARY_SETUP.md (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).";

let cached: CloudinaryV2 | null = null;

export interface CloudinaryImageResource {
  publicId: string;
  folder: string | null;
  width: number;
  height: number;
  /** Formato do arquivo no Cloudinary ("jpg", "png", "webp"). */
  format: string;
  version: number;
  secureUrl: string;
}

/** SDK do Cloudinary para admin API (resource/destroy). 503 se credenciais ausentes. */
export async function getCloudinaryAdmin(): Promise<CloudinaryV2> {
  if (cached) return cached;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(`Credenciais Cloudinary incompletas (faltam CLOUDINARY_*). ${CLOUDINARY_SETUP_HINT}`, 503);
  }
  const mod = await import("cloudinary");
  mod.v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  cached = mod.v2;
  return cached;
}

/** Busca o recurso de imagem no Cloudinary. `null` se não existir (404). */
export async function fetchCloudinaryImageResource(
  publicId: string,
): Promise<CloudinaryImageResource | null> {
  const cloudinary = await getCloudinaryAdmin();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await cloudinary.api.resource(publicId, { resource_type: "image" });
    return {
      publicId: r.public_id,
      folder: r.folder ?? null,
      width: r.width,
      height: r.height,
      format: r.format,
      version: r.version,
      secureUrl: r.secure_url,
    };
  } catch (err: any) {
    const httpCode = err?.error?.http_code ?? err?.http_code ?? err?.statusCode;
    if (httpCode === 404) return null;
    throw err;
  }
}

/** Remove uma imagem do Cloudinary (idempotente em 404). */
export async function destroyCloudinaryImage(publicId: string): Promise<void> {
  const cloudinary = await getCloudinaryAdmin();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (err: any) {
    const httpCode = err?.error?.http_code ?? err?.http_code ?? err?.statusCode;
    if (httpCode === 404) return;
    throw err;
  }
}
