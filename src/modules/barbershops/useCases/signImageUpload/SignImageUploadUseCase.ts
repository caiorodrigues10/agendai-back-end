import { injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  COVER_IMAGE_SPEC,
  ImageSpec,
  LOGO_IMAGE_SPEC,
  imageSpecAllowedFormats,
  imageSpecFolder,
  imageSpecPublicId,
} from "@/shared/constants/imageSpecs";
import { assertOwnerShop } from "../pageTheme/GetPageThemeUseCase";

export type ImageUploadKind = "cover" | "logo";

const KIND_SPEC: Record<ImageUploadKind, ImageSpec> = {
  cover: COVER_IMAGE_SPEC,
  logo: LOGO_IMAGE_SPEC,
};

/**
 * Validade da assinatura: o Cloudinary não valida a idade do timestamp,
 * então a expiração é aplicada pelo cliente (re-assina 1x em erro de
 * assinatura) e o rate limit da rota impede abuso.
 */
const SIGN_EXPIRES_SECONDS = 60;

export interface ISignedImageUpload {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  folder: string;
  publicId: string;
  timestamp: number;
  signature: string;
  expiresInSeconds: number;
  params: Record<string, string>;
}

export interface ISignImageUploadDTO {
  barbershopId: string;
  kind: ImageUploadKind;
}

/**
 * Gera credenciais para upload DIRETO do cliente ao Cloudinary
 * (POST {uploadUrl} multipart com arquivo + params assinados no back).
 */
@injectable()
export class SignImageUploadUseCase {
  async execute(
    data: ISignImageUploadDTO,
    requestingUser: { role: string; barbershopId?: string },
  ): Promise<ISignedImageUpload> {
    assertOwnerShop(requestingUser, data.barbershopId);

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new AppError(
        "Credenciais Cloudinary incompletas (faltam CLOUDINARY_*). Configure o env do servidor.",
        503,
      );
    }

    const mod = await import("cloudinary");
    const spec = KIND_SPEC[data.kind];
    const timestamp = Math.floor(Date.now() / 1000);
    const allowedFormats = imageSpecAllowedFormats(spec);

    // public_id é o caminho absoluto (sem `folder` separado) — enviar os dois
    // faria o Cloudinary aninhar agendaja/.../agendaja/....
    const paramsToSign: Record<string, string | number> = {
      timestamp,
      public_id: imageSpecPublicId(data.barbershopId, spec),
      overwrite: 1,
      invalidate: 1,
      allowed_formats: allowedFormats,
    };
    const signature = mod.v2.utils.api_sign_request(paramsToSign, apiSecret);

    return {
      cloudName,
      apiKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      folder: imageSpecFolder(data.barbershopId, spec),
      publicId: paramsToSign.public_id as string,
      timestamp,
      signature,
      expiresInSeconds: SIGN_EXPIRES_SECONDS,
      params: {
        api_key: apiKey,
        timestamp: String(timestamp),
        public_id: imageSpecPublicId(data.barbershopId, spec),
        overwrite: "1",
        invalidate: "1",
        allowed_formats: allowedFormats,
        signature,
      },
    };
  }
}
