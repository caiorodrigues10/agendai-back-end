/**
 * URL do cartão Open Graph (1200×630) da capa do salão.
 *
 * Espelho do `buildCoverOgUrl` do frontend (`src/shared/coverImage.ts`): mesma
 * proporção, mesmo ponto focal e a mesma trava de "nunca ampliar". Mantido em
 * dois lados de propósito — o back serve o HTML de compartilhamento e o front
 * serve a capa da página pública, e as duas prévias precisam casar.
 */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const OG_ASPECT = OG_IMAGE_WIDTH / OG_IMAGE_HEIGHT;

/** Teto de segurança quando as dimensões originais são desconhecidas (legado). */
const FALLBACK_MAX_WIDTH = 1920;

export interface CoverOgUrlOptions {
  /** Ponto focal horizontal 0–100 (ausente/50 = centro). */
  focalX?: number | null;
  /** Ponto focal vertical 0–100 (ausente/50 = centro). */
  focalY?: number | null;
  /** Largura original do arquivo (`coverWidth` do tema). */
  originalWidth?: number | null;
  /** Altura original do arquivo (`coverHeight` do tema). */
  originalHeight?: number | null;
}

function clampPercent(value: number | null | undefined, fallback = 50): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function resolveCapForAspect(options: CoverOgUrlOptions, aspect: number): number {
  const caps: number[] = [FALLBACK_MAX_WIDTH];
  if (options.originalWidth && options.originalWidth > 0) {
    caps.push(Math.floor(options.originalWidth));
  }
  if (options.originalHeight && options.originalHeight > 0) {
    caps.push(Math.floor(options.originalHeight * aspect));
  }
  return Math.max(1, Math.min(...caps));
}

/** `g_auto` no centro; focal ajustado → `g_xy_center` em px do original. */
function focalGravity(options: CoverOgUrlOptions): string {
  const focalX = clampPercent(options.focalX);
  const focalY = clampPercent(options.focalY);
  if (focalX === 50 && focalY === 50) return "g_auto";
  if (!options.originalWidth || !options.originalHeight) return "g_auto";
  const x = Math.min(
    Math.floor(options.originalWidth),
    Math.max(0, Math.round((focalX / 100) * options.originalWidth)),
  );
  const y = Math.min(
    Math.floor(options.originalHeight),
    Math.max(0, Math.round((focalY / 100) * options.originalHeight)),
  );
  return `g_xy_center,x_${x},y_${y}`;
}

function withTransforms(url: string, transforms: string): string {
  if (!url.includes("/image/upload/")) return url;
  return url.replace("/image/upload/", `/image/upload/${transforms}/`);
}

/**
 * URL de 1200×630 JPEG (`f_jpg,q_auto`) limitada pelo original: uma origem
 * menor entrega recorte proporcional — nunca amplia. URLs fora do Cloudinary
 * são devolvidas sem transformação.
 */
export function buildCoverOgUrl(url: string, options: CoverOgUrlOptions = {}): string {
  const cap = resolveCapForAspect(options, OG_ASPECT);
  const width = Math.max(1, Math.min(OG_IMAGE_WIDTH, cap));
  const height = Math.max(1, Math.round(width / OG_ASPECT));
  return withTransforms(
    url,
    `w_${width},h_${height},c_fill,${focalGravity(options)},f_jpg,q_auto`,
  );
}
