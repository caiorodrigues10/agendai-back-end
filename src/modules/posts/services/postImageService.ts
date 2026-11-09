import { buildLegalPostSvg } from './legalPostSvg';
import { legalTemplateIndex, type LegalPostData } from './legalPostTemplates';
import { buildPostCompositionSvg, postCompositionMetrics } from './postCompositionSvg';
import { renderSvgToPng } from '@/shared/infra/worker/postRenderPool';
import { POST_TEMPLATES, TEMPLATE_VERSION } from './postTemplates';

export type PostSvgInput = {
  shopName: string;
  logoUrl?: string | null;
  services: { name: string; price: number }[];
  todaySchedule: { isOpen: boolean; openTime: string; closeTime: string } | null;
  postMode: "queue" | "appointments" | "both";
  ctaText: string;
  title: string;
  templateKey?: string;
  format?: "square" | "portrait" | "story";
  primaryImageUrl?: string | null;
  secondaryImageUrl?: string | null;
  paletteKey?: string;
  designOptions?: { focalX?: number; focalY?: number; overlay?: number; legalPost?: LegalPostData };
  illustrativeBackground?: boolean;
};

/** Shared geometry for the measured non-legal compositions. */
export function postLayoutMetrics(input: PostSvgInput) {
  if (legalTemplateIndex(input.templateKey) >= 0) {
    const format = input.format ?? 'square';
    const height = format === 'story' ? 1920 : format === 'portrait' ? 1350 : 1080;
    return { height, shopY: format === 'story' ? 178 : 56, top: format === 'story' ? 300 : 180, ctaY: height - (format === 'story' ? 206 : 52), footerY: height - 30 };
  }
  return postCompositionMetrics(input);
}

export function buildPostSvg(input: PostSvgInput): string {
  if (legalTemplateIndex(input.templateKey) >= 0) return buildLegalPostSvg(input);
  const key = input.templateKey ?? 'agenda-aberta';
  const template = POST_TEMPLATES.find(item => item.key === key) ?? { key, photoMode: 'optional' };
  return buildPostCompositionSvg(input, template, TEMPLATE_VERSION);
}

/** CPU-bound rasterization stays in the existing worker pool. */
export function renderPostSvgToPng(svg: string): Promise<Buffer> {
  return renderSvgToPng(svg);
}

export function pngToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}
