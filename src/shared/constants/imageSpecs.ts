export interface ImageSpec {
  key: "cover" | "logo";
  label: string;
  recommendedWidth: number;
  recommendedHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  ratio: number;
  ratioTolerance: number;
  maxBytes: number;
  allowedMimeTypes: Record<string, string>;
  allowedFormats: Array<"jpeg" | "png" | "webp">;
  cloudinaryFolderSegment: string;
  cloudinaryPublicId: string;
  ratioLabel: string;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const COVER_IMAGE_SPEC: ImageSpec = {
  key: "cover",
  label: "Capa",
  recommendedWidth: 1920,
  recommendedHeight: 1080,
  minWidth: 1600,
  minHeight: 900,
  maxWidth: 4096,
  maxHeight: 2304,
  ratio: 16 / 9,
  ratioTolerance: 0.01,
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: IMAGE_MIME_TYPES,
  allowedFormats: ["jpeg", "png", "webp"],
  cloudinaryFolderSegment: "cover",
  cloudinaryPublicId: "cover",
  ratioLabel: "16:9",
};

export const LOGO_IMAGE_SPEC: ImageSpec = {
  key: "logo",
  label: "Logo",
  recommendedWidth: 512,
  recommendedHeight: 512,
  minWidth: 400,
  minHeight: 400,
  maxWidth: 2048,
  maxHeight: 2048,
  ratio: 1,
  ratioTolerance: 0.01,
  maxBytes: 2 * 1024 * 1024,
  allowedMimeTypes: IMAGE_MIME_TYPES,
  allowedFormats: ["jpeg", "png", "webp"],
  cloudinaryFolderSegment: "logo",
  cloudinaryPublicId: "logo",
  ratioLabel: "1:1",
};

export function imageSpecFolder(barbershopId: string, spec: ImageSpec): string {
  return `agendaja/${barbershopId}/${spec.cloudinaryFolderSegment}`;
}

export function imageSpecPublicId(barbershopId: string, spec: ImageSpec): string {
  return `${imageSpecFolder(barbershopId, spec)}/${spec.cloudinaryPublicId}`;
}

export function describeImageDimensionError(
  spec: ImageSpec,
  width: number,
  height: number,
): string {
  return (
    `Sua imagem tem ${width}×${height}. ` +
    `Envie uma imagem ${spec.ratioLabel} com no mínimo ${spec.minWidth}×${spec.minHeight} ` +
    `(recomendado ${spec.recommendedWidth}×${spec.recommendedHeight}).`
  );
}
