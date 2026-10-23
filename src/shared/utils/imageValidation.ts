import sharp, { type Metadata, type OutputInfo } from "sharp";
import { AppError } from "@/shared/errors/AppError";
import {
  describeImageDimensionError,
  ImageSpec,
  LogoImageSpec,
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

function maxDimensionMessage(spec: LogoImageSpec, width: number, height: number): string {
  return (
    `Sua imagem tem ${width}×${height}. ` +
    `O máximo permitido é ${spec.maxWidth}×${spec.maxHeight}.`
  );
}

/**
 * Decodifica, remove metadados (EXIF/GPS) e valida formato de uma imagem;
 * dimensões/proporção só quando a spec é estrita (logo 1:1). A capa aceita
 * QUALQUER medida — o recorte 16:9 e o focal point acontecem na entrega.
 * Peso é checado ANTES do decode (413), sem bufferizar/decodificar o que já
 * passou do limite. A normalização regrava o arquivo sem metadados antes do
 * upload.
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

  // Ordem importa: peso antes de decodificar (senão vira "arquivo corrompido").
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
  if (spec.key === "logo") {
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
