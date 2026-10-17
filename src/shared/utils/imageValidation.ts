import sharp, { type Metadata, type OutputInfo } from "sharp";
import { AppError } from "@/shared/errors/AppError";
import {
  describeImageDimensionError,
  ImageSpec,
} from "@/shared/constants/imageSpecs";

export interface ValidatedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  mimeType: string;
  size: number;
}

const FORMAT_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function maxDimensionMessage(spec: ImageSpec, width: number, height: number): string {
  return (
    `Sua imagem tem ${width}×${height}. ` +
    `O máximo permitido é ${spec.maxWidth}×${spec.maxHeight}.`
  );
}

/**
 * Decodifica, remove metadados (EXIF/GPS) e valida dimensões, proporção,
 * formato e tamanho de uma imagem. Qualquer violação vira AppError 400/413.
 * A normalização regrava o arquivo sem metadados antes do upload.
 */
export async function validateAndNormalizeImage(params: {
  buffer: Buffer;
  declaredMimeType?: string;
  spec: ImageSpec;
}): Promise<ValidatedImage> {
  const { buffer, declaredMimeType, spec } = params;

  if (!buffer || buffer.byteLength === 0) {
    throw new AppError("Arquivo vazio.", 400);
  }

  if (buffer.byteLength > spec.maxBytes) {
    const sizeMb = (buffer.byteLength / 1024 / 1024).toFixed(2);
    const maxMb = (spec.maxBytes / 1024 / 1024).toFixed(0);
    throw new AppError(`Arquivo muito grande (${sizeMb} MB). Máximo permitido: ${maxMb} MB`, 413);
  }

  let decoded: Metadata;
  try {
    decoded = await sharp(buffer, { limitInputPixels: 100_000_000 }).metadata();
  } catch {
    throw new AppError(
      "Arquivo corrompido ou não é uma imagem válida. Aceitos: JPEG, PNG, WebP",
      400,
    );
  }

  const format = decoded.format as string | undefined;
  if (!format || !spec.allowedFormats.includes(format as "jpeg" | "png" | "webp")) {
    throw new AppError(
      `Tipo de arquivo não permitido${declaredMimeType ? `: "${declaredMimeType}"` : ""}. Aceitos: JPEG, PNG, WebP`,
      400,
    );
  }

  let normalized: { data: Buffer; info: OutputInfo };
  try {
    normalized = await sharp(buffer, { limitInputPixels: 100_000_000 })
      .rotate()
      .toFormat(format as "jpeg" | "png" | "webp")
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError("Não foi possível processar a imagem. Envie outro arquivo.", 400);
  }

  const { width, height } = normalized.info;
  if (width < spec.minWidth || height < spec.minHeight) {
    throw new AppError(describeImageDimensionError(spec, width, height), 400);
  }
  if (width > spec.maxWidth || height > spec.maxHeight) {
    throw new AppError(maxDimensionMessage(spec, width, height), 400);
  }

  const ratio = width / height;
  if (Math.abs(ratio - spec.ratio) > spec.ratioTolerance) {
    throw new AppError(describeImageDimensionError(spec, width, height), 400);
  }

  return {
    buffer: normalized.data,
    width,
    height,
    format: format as "jpeg" | "png" | "webp",
    mimeType: FORMAT_MIME[format],
    size: normalized.data.byteLength,
  };
}
