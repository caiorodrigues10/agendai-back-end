/**
 * SPEC ÚNICA DE IMAGENS — fonte única de verdade (backend).
 * Espelhada no frontend por `npm run theme:mirror`
 * (frontend/scripts/generate-shop-theme-mirror.mjs); `npm run theme:check` falha
 * se o espelho estiver desatualizado.
 *
 * | Imagem | Dimensões aceitas                        | Proporção    | Formatos       |
 * |--------|------------------------------------------|--------------|----------------|
 * | Capa   | QUALQUER (recomendado 1920×1080)         | Qualquer     | JPG, PNG, WebP |
 * | Logo   | 400–2048 (recomendado 512×512)           | 1:1 EXATA    | JPG, PNG, WebP |
 *
 * A capa NÃO é bloqueada por medida/proporção: `recommended` é apenas
 * recomendação de UI. O recorte para 16:9 (Cloudinary `c_fill,ar_16:9`) e o
 * ponto focal (`coverFocalX/Y`) acontecem na entrega da imagem (helper único
 * do front em `shared/coverImage.ts`); o back guarda `coverWidth/coverHeight`
 * para o front calcular o recorte sem ampliar. O logo continua estrito
 * (min/max/proporção exata validados com sharp).
 *
 * Peso: validado no back ANTES do decode (`validateAndNormalizeImage` → 413)
 * — capa ≤5 MB, logo ≤2 MB (`maxBytes` é a fonte única). O multipart global
 * também limita a 5 MB por arquivo (teto de memória do back; vídeo/mídia de
 * post sobrescrevem por rota). A UI não precisa citar esse limite.
 *
 * Alterar valores aqui SEM rodar o espelho reprova `theme:check` no front.
 */

/** Spec estrita: logo 1:1 (min/max/proporção validados no back). */
export interface LogoImageSpec {
  key: "logo";
  label: string;
  recommendedWidth: number;
  recommendedHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  ratio: number;
  ratioTolerance: number;
  /** Limite de bytes — enforced ANTES do decode (413). */
  maxBytes: number;
  allowedMimeTypes: Record<string, string>;
  allowedFormats: ("jpeg" | "png" | "webp")[];
  cloudinaryFolderSegment: string;
  cloudinaryPublicId: string;
  ratioLabel: string;
}

/**
 * Spec da capa: qualquer medida é aceita; `recommended` é só recomendação de
 * UI. A index signature preserva leituras legadas (`recommendedWidth`,
 * `minWidth`, …) em testes antigos — que passam a valer `undefined` em
 * runtime; nenhum código novo deve lê-las.
 */
export interface CoverImageSpec {
  key: "cover";
  label: string;
  recommended: { width: number; height: number; aspect: string };
  /** Limite de bytes — enforced ANTES do decode (413). */
  maxBytes: number;
  allowedMimeTypes: Record<string, string>;
  allowedFormats: ("jpeg" | "png" | "webp")[];
  cloudinaryFolderSegment: string;
  cloudinaryPublicId: string;
  readonly [legacy: string]: unknown;
}

export type ImageSpec = LogoImageSpec | CoverImageSpec;

const IMAGE_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const COVER_IMAGE_SPEC: CoverImageSpec = {
  key: "cover",
  label: "Capa",
  recommended: { width: 1920, height: 1080, aspect: "16:9" },
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: IMAGE_MIME_TYPES,
  allowedFormats: ["jpeg", "png", "webp"],
  cloudinaryFolderSegment: "cover",
  cloudinaryPublicId: "cover",
};

/**
 * Tamanho máximo por arquivo de FOTO DE POST (biblioteca/galeria, rota
 * `POST /posts/media/:barbershopId`). Enforçado no multipart do back (limits
 * por rota) e validado no browser pelo front — o espelho deve usar o MESMO
 * número (fonte única: este arquivo).
 */
export const POST_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export const LOGO_IMAGE_SPEC: LogoImageSpec = {
  key: "logo",
  label: "Logo",
  recommendedWidth: 512,
  recommendedHeight: 512,
  minWidth: 400,
  minHeight: 400,
  maxWidth: 2048,
  maxHeight: 2048,
  ratio: 1,
  ratioTolerance: 0,
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

/**
 * Lista única de formatos para o `allowed_formats` do upload assinado no
 * Cloudinary (extensões: `jpg,png,webp`), derivada de `spec.allowedFormats`
 * — a fonte única dos formatos aceitos.
 */
export function imageSpecAllowedFormats(spec: ImageSpec): string {
  return spec.allowedFormats.map((f) => (f === "jpeg" ? "jpg" : f)).join(",");
}

/** Erro de dimensão/proporção: apenas o logo (a capa aceita qualquer medida). */
export function describeImageDimensionError(
  spec: LogoImageSpec,
  width: number,
  height: number,
): string {
  return (
    `Sua imagem tem ${width}×${height}. ` +
    `Envie uma imagem ${spec.ratioLabel} com no mínimo ${spec.minWidth}×${spec.minHeight} ` +
    `(recomendado ${spec.recommendedWidth}×${spec.recommendedHeight}).`
  );
}
