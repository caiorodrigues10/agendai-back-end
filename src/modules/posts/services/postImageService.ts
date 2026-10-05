import { BRAND_NAME } from '@/config/brand';
import { renderSvgToPng } from "@/shared/infra/worker/postRenderPool";
import { FONT_FAMILY } from "./postSvgRenderer";
import { getPostPalette, type PostPalette } from "./postPalettes";
import { TEMPLATE_VERSION } from "./postTemplates";

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
  designOptions?: { focalX?: number; focalY?: number; overlay?: number };
  illustrativeBackground?: boolean;
};

const TEAL = "#00C2B3";
const TEAL_FG = "#0A0F18";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}...` : value;
}

function wrapTitle(raw: string): string[] {
  const t = truncate(raw, 48);
  if (t.length <= 22) return [t];
  const cut = t.lastIndexOf(" ", 24);
  const at = cut >= 10 ? cut : 22;
  return [t.slice(0, at).trim(), truncate(t.slice(at).trim(), 24)];
}

type LayoutCtx = {
  input: PostSvgInput;
  accent: string;
  accentFg: string;
  fg: string;
  muted: string;
  surface: string;
  border: string;
  isLight: boolean;
  height: number;
  width: number;
  format: "square" | "portrait" | "story";
  top: number;
  ctaY: number;
  titleLines: string[];
  ctaText: string;
  scheduleLabel: string;
  hoursKicker: string;
  services: { name: string; price: number }[];
  focalX: number;
  focalY: number;
  overlayOpacity: number;
};

function titleBlock(ctx: LayoutCtx, y: number, size = 52, anchor = "middle", x = 540): { svg: string; bottom: number } {
  const lh = Math.round(size * 1.3);
  const svg = ctx.titleLines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * lh}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="800" fill="${ctx.fg}" text-anchor="${anchor}">${line}</text>`
    )
    .join("");
  return { svg, bottom: y + ctx.titleLines.length * lh };
}

function hoursCard(ctx: LayoutCtx, y: number, opts?: { width?: number; x?: number }): { svg: string; bottom: number } {
  const w = opts?.width ?? 880;
  const x = opts?.x ?? 100;
  const svg = `<g>
  <rect x="${x}" y="${y}" width="${w}" height="88" rx="20" fill="${ctx.surface}" stroke="${ctx.border}" stroke-width="1.5" />
  <text x="${x + 36}" y="${y + 34}" font-family="${FONT_FAMILY}" font-size="16" font-weight="700" fill="${ctx.accent}" letter-spacing="3">${ctx.hoursKicker}</text>
  <text x="${x + 36}" y="${y + 68}" font-family="${FONT_FAMILY}" font-size="28" font-weight="700" fill="${ctx.fg}">${escapeXml(ctx.scheduleLabel)}</text>
</g>`;
  return { svg, bottom: y + 88 };
}

function serviceRows(
  ctx: LayoutCtx,
  y: number,
  services: { name: string; price: number }[],
  rowH = 92
): { svg: string; bottom: number } {
  const svg = services
    .map((service, i) => {
      const ry = y + i * rowH;
      return `<g>
  <rect x="100" y="${ry}" width="880" height="${rowH - 12}" rx="18" fill="${ctx.surface}" stroke="${ctx.border}" stroke-width="1.5" />
  <rect x="100" y="${ry}" width="7" height="${rowH - 12}" rx="3" fill="${ctx.accent}" />
  <text x="136" y="${ry + (rowH - 12) / 2 + 10}" font-family="${FONT_FAMILY}" font-size="26" font-weight="600" fill="${ctx.fg}">${escapeXml(truncate(service.name, 26))}</text>
  <text x="948" y="${ry + (rowH - 12) / 2 + 10}" font-family="${FONT_FAMILY}" font-size="26" font-weight="700" fill="${ctx.accent}" text-anchor="end">${escapeXml(formatBRL(service.price))}</text>
</g>`;
    })
    .join("");
  return { svg, bottom: y + services.length * rowH };
}

/**
 * Caixa de imagem ampliada + deslocamento de foco: a imagem é desenhada
 * ~30% maior que o painel e deslocada conforme o ponto focal, garantindo
 * cobertura total (sem bordas vazias) em qualquer direção do foco.
 */
function focalImageBox(
  ctx: LayoutCtx,
  x: number,
  y: number,
  w: number,
  h: number
): { imgX: number; imgY: number; imgW: number; imgH: number } {
  const zoom = 1.3;
  const imgW = Math.round(w * zoom);
  const imgH = Math.round(h * zoom);
  const fx = Math.max(-0.5, Math.min(0.5, (ctx.focalX - 50) / 100));
  const fy = Math.max(-0.5, Math.min(0.5, (ctx.focalY - 50) / 100));
  return {
    imgX: Math.round(x - (imgW - w) / 2 - fx * (imgW - w)),
    imgY: Math.round(y - (imgH - h) / 2 - fy * (imgH - h)),
    imgW,
    imgH,
  };
}

function photoPanel(
  ctx: LayoutCtx,
  href: string | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  clipId: string,
  placeholderLabel?: string
): string {
  if (href?.startsWith("data:image")) {
    const overlay = ctx.overlayOpacity;
    const box = focalImageBox(ctx, x, y, w, h);
    return `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" /></clipPath>
<image href="${escapeXml(href)}" x="${box.imgX}" y="${box.imgY}" width="${box.imgW}" height="${box.imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="#000" opacity="${overlay}" />
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="none" stroke="${ctx.border}" stroke-width="1.5" />`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${ctx.surface}" stroke="${ctx.border}" stroke-width="1.5" />
<circle cx="${x + w / 2}" cy="${y + h / 2 - 14}" r="34" fill="none" stroke="${ctx.accent}" stroke-width="3" opacity="0.55" />
<path d="M ${x + w / 2 - 14} ${y + h / 2 - 20} l 28 0 l -14 20 z" fill="${ctx.accent}" opacity="0.55" />
${placeholderLabel ? `<text x="${x + w / 2}" y="${y + h / 2 + 52}" font-family="${FONT_FAMILY}" font-size="20" font-weight="700" fill="${ctx.muted}" text-anchor="middle">${escapeXml(placeholderLabel)}</text>` : ""}`;
}

function isRealPhoto(href: string | null | undefined): href is string {
  return Boolean(href?.startsWith("data:image"));
}

function fullBleedImage(ctx: LayoutCtx, href: string | null | undefined, clipId: string): string {
  if (!isRealPhoto(href)) return "";
  return `<clipPath id="${clipId}"><rect x="0" y="0" width="1080" height="${ctx.height}" rx="0" /></clipPath>
<image href="${escapeXml(href)}" x="0" y="0" width="1080" height="${ctx.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />
<rect x="0" y="0" width="1080" height="${ctx.height}" fill="#050806" opacity="${ctx.isLight ? 0.04 : 0.2}" />`;
}

/**
 * Foto editorial: desenha SOMENTE quando há imagem real (dataURL).
 * Sem foto, não renderiza nada — o layout resolve com tipografia
 * (sem ícone/placeholder na exportação).
 */
function photoFill(
  ctx: LayoutCtx,
  href: string | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  clipId: string,
  radius = 24,
  border = true
): string {
  if (!isRealPhoto(href)) return "";
  const box = focalImageBox(ctx, x, y, w, h);
  return `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" /></clipPath>
<image href="${escapeXml(href)}" x="${box.imgX}" y="${box.imgY}" width="${box.imgW}" height="${box.imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="#000" opacity="${Math.min(ctx.overlayOpacity, 0.35)}" />
${border ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="none" stroke="${ctx.border}" stroke-width="1.5" />` : ""}`;
}

/** Kicker editorial: etiqueta pequena em caixa alta com espaçamento. */
function kicker(ctx: LayoutCtx, x: number, y: number, label: string, anchor = "start"): string {
  return `<text x="${x}" y="${y}" font-family="${FONT_FAMILY}" font-size="20" font-weight="700" fill="${ctx.accent}" text-anchor="${anchor}" letter-spacing="5">${escapeXml(label.toUpperCase())}</text>`;
}

function hrule(ctx: LayoutCtx, x1: number, x2: number, y: number, opacity = 1): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ctx.fg}" stroke-width="2" opacity="${opacity}" />`;
}

function badge(ctx: LayoutCtx, cx: number, y: number, label: string): string {
  const w = Math.max(180, label.length * 15 + 64);
  return `<g>
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="52" rx="26" fill="${ctx.accent}" />
  <text x="${cx}" y="${y + 35}" font-family="${FONT_FAMILY}" font-size="22" font-weight="800" fill="${ctx.accentFg}" text-anchor="middle" letter-spacing="2">${escapeXml(label)}</text>
</g>`;
}

const TEMPLATE_LAYOUTS: Record<string, (ctx: LayoutCtx) => string> = {
  "agenda-aberta": (ctx) => {
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "agendaPromoBg");
      const title = titleBlock(ctx, ctx.top + 78, 46);
      const services = ctx.services.slice(0, 3);
      const startY = title.bottom + 94;
      const rows = services
        .map(
          (service, i) =>
            `<text x="240" y="${startY + i * 116}" font-family="${FONT_FAMILY}" font-size="28" font-weight="800" fill="${ctx.fg}">${escapeXml(truncate(service.name, 18))}</text>
<text x="540" y="${startY + i * 116 + 46}" font-family="${FONT_FAMILY}" font-size="22" font-weight="700" fill="${ctx.muted}" text-anchor="middle">${escapeXml(formatBRL(service.price))}</text>`
        )
        .join("");
      return `${bg}
${title.svg}
${kicker(ctx, 540, title.bottom + 42, ctx.scheduleLabel, "middle")}
${rows}`;
    }
    const title = titleBlock(ctx, ctx.top + 56);
    const hours = hoursCard(ctx, title.bottom + 28);
    const services = serviceRows(ctx, hours.bottom + 20, ctx.services.slice(0, 3));
    return title.svg + hours.svg + services.svg;
  },

  "ultimas-vagas": (ctx) => {
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "uvPromoBg");
      const title = titleBlock(ctx, ctx.top + 76, 46);
      const hours = hoursCard(ctx, ctx.ctaY - 132, { width: 700, x: 190 });
      return `${bg}
${title.svg}
${badge(ctx, 540, title.bottom + 34, "ÚLTIMAS VAGAS")}
<rect x="112" y="${title.bottom + 130}" width="856" height="240" rx="34" fill="${ctx.isLight ? "#FAF7EF" : "#101512"}" opacity="0.9" stroke="${ctx.accent}" stroke-width="2" />
<text x="540" y="${title.bottom + 228}" font-family="${FONT_FAMILY}" font-size="76" font-weight="800" fill="${ctx.accent}" text-anchor="middle">HOJE</text>
<text x="540" y="${title.bottom + 292}" font-family="${FONT_FAMILY}" font-size="34" font-weight="800" fill="${ctx.fg}" text-anchor="middle" letter-spacing="5">AGENDA LIMITADA</text>
${hours.svg}`;
    }
    const title = titleBlock(ctx, ctx.top + 50, 44);
    const span = ctx.ctaY - ctx.top;
    const hoursY = ctx.ctaY - 118; // card de horas ancorado acima do CTA
    const hours = hoursCard(ctx, hoursY, { width: 700, x: 190 });
    const badgeG = badge(ctx, 540, title.bottom + 24, "CORRE QUE ACABA");
    if (isRealPhoto(ctx.input.primaryImageUrl)) {
      // Orçamento: foto ocupa o que sobrar entre o selo e o bloco de urgência.
      const big1 = hoursY - 96; // baseline de "ÚLTIMAS" (96px)
      const big2 = big1 + 64;   // baseline de "VAGAS HOJE"
      const photoY = title.bottom + 24 + 52 + 12;
      const photoH = Math.max(160, big1 - 100 - photoY);
      const photo = photoFill(ctx, ctx.input.primaryImageUrl, 140, photoY, 800, photoH, "uvClip");
      return `${title.svg}
${badgeG}
${photo}
<text x="540" y="${big1}" font-family="${FONT_FAMILY}" font-size="96" font-weight="800" fill="${ctx.accent}" text-anchor="middle">ÚLTIMAS</text>
<text x="540" y="${big2}" font-family="${FONT_FAMILY}" font-size="56" font-weight="800" fill="${ctx.fg}" text-anchor="middle" letter-spacing="6">VAGAS HOJE</text>
${hours.svg}`;
    }
    const midY = ctx.top + Math.round(span * 0.42);
    return `${title.svg}
${badgeG}
<text x="540" y="${Math.min(midY + 150, hoursY - 116)}" font-family="${FONT_FAMILY}" font-size="150" font-weight="800" fill="${ctx.accent}" text-anchor="middle">ÚLTIMAS</text>
<text x="540" y="${Math.min(midY + 244, hoursY - 24)}" font-family="${FONT_FAMILY}" font-size="84" font-weight="800" fill="${ctx.fg}" text-anchor="middle" letter-spacing="6">VAGAS HOJE</text>
${hours.svg}`;
  },

  "promocao-relampago": (ctx) => {
    const svc = ctx.services[0];
    const span = ctx.ctaY - ctx.top;
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "promoBg");
      const title = titleBlock(ctx, ctx.top + 70, 46);
      const priceY = Math.min(ctx.ctaY - 150, title.bottom + 300);
      const offer = svc
        ? `<text x="540" y="${title.bottom + 176}" font-family="${FONT_FAMILY}" font-size="38" font-weight="800" fill="${ctx.fg}" text-anchor="middle">${escapeXml(truncate(svc.name, 24))}</text>
<text x="540" y="${priceY}" font-family="${FONT_FAMILY}" font-size="100" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(formatBRL(svc.price))}</text>`
        : `<text x="540" y="${title.bottom + 236}" font-family="${FONT_FAMILY}" font-size="62" font-weight="800" fill="${ctx.accent}" text-anchor="middle">OFERTA ESPECIAL</text>`;
      return `${bg}
${title.svg}
${badge(ctx, 540, title.bottom + 44, "SÓ HOJE")}
<rect x="118" y="${title.bottom + 112}" width="844" height="330" rx="38" fill="${ctx.isLight ? "#FAF7EF" : "#111714"}" opacity="0.88" stroke="${ctx.accent}" stroke-width="2" />
${offer}`;
    }
    if (isRealPhoto(ctx.input.primaryImageUrl)) {
      // Orçamento: reserva título (≤2 linhas), selo, nome e preço; foto pega o resto.
      const titleLines = ctx.titleLines.length;
      const titleH = titleLines * 60;           // 46px * 1.3
      const belowReserve = 84 + titleH + 28 + 52 + 44 + 44 + 108 + 30;
      const photoH = Math.min(ctx.format === "story" ? 520 : 420, Math.max(200, span - belowReserve));
      const photo = photoFill(ctx, ctx.input.primaryImageUrl, 84, ctx.top + 8, 912, photoH, "promoClip");
      const titleY = ctx.top + 8 + photoH + 84;
      const title = titleBlock(ctx, titleY, 46);
      const badgeY = title.bottom + 28;
      const middle = badge(ctx, 540, badgeY, "SÓ HOJE");
      const nameY = badgeY + 52 + 44;
      const body = svc
        ? `<text x="540" y="${nameY}" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="${ctx.fg}" text-anchor="middle">${escapeXml(truncate(svc.name, 24))}</text>
<text x="540" y="${nameY + 64}" font-family="${FONT_FAMILY}" font-size="92" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(formatBRL(svc.price))}</text>`
        : `<text x="540" y="${nameY + 52}" font-family="${FONT_FAMILY}" font-size="60" font-weight="800" fill="${ctx.accent}" text-anchor="middle">OFERTA RELÂMPAGO</text>`;
      return `${photo}${title.svg}${middle}${body}`;
    }
    const title = titleBlock(ctx, ctx.top + 56, 46);
    let y = title.bottom + 36;
    let middle = badge(ctx, 540, y, "SÓ HOJE");
    y += 120;
    middle += `<path d="M 560 ${y - 40} l -52 96 l 40 0 l -30 84 l 84 -110 l -44 0 l 40 -70 z" fill="${ctx.accent}" opacity="0.9" />`;
    if (svc) {
      middle += `<text x="540" y="${y + 210}" font-family="${FONT_FAMILY}" font-size="40" font-weight="700" fill="${ctx.fg}" text-anchor="middle">${escapeXml(truncate(svc.name, 24))}</text>
<text x="540" y="${y + 320}" font-family="${FONT_FAMILY}" font-size="104" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(formatBRL(svc.price))}</text>`;
    } else {
      middle += `<text x="540" y="${y + 250}" font-family="${FONT_FAMILY}" font-size="64" font-weight="800" fill="${ctx.accent}" text-anchor="middle">OFERTA RELÂMPAGO</text>`;
    }
    return title.svg + middle;
  },

  "servico-destaque": (ctx) => {
    const svc = ctx.services[0];
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "svcPromoBg");
      const title = titleBlock(ctx, ctx.top + 72, 44);
      const cardY = title.bottom + 66;
      const cardH = Math.min(390, ctx.ctaY - cardY - 40);
      const card = svc
        ? `<text x="540" y="${cardY + cardH * 0.34}" font-family="${FONT_FAMILY}" font-size="46" font-weight="800" fill="${ctx.fg}" text-anchor="middle">${escapeXml(truncate(svc.name, 22))}</text>
<text x="540" y="${cardY + cardH * 0.66}" font-family="${FONT_FAMILY}" font-size="106" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(formatBRL(svc.price))}</text>
<text x="540" y="${cardY + cardH - 44}" font-family="${FONT_FAMILY}" font-size="22" font-weight="700" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`
        : `<text x="540" y="${cardY + cardH / 2}" font-family="${FONT_FAMILY}" font-size="42" font-weight="800" fill="${ctx.fg}" text-anchor="middle">Serviço em destaque</text>`;
      return `${bg}
${title.svg}
<rect x="150" y="${cardY}" width="780" height="${cardH}" rx="34" fill="${ctx.isLight ? "#FAF7EF" : "#111714"}" opacity="0.9" stroke="${ctx.accent}" stroke-width="2" />
${card}`;
    }
    const title = titleBlock(ctx, ctx.top + 52, 44);
    const span = ctx.ctaY - title.bottom - 80;
    let photo = "";
    let cardY = title.bottom + 40;
    if (isRealPhoto(ctx.input.primaryImageUrl)) {
      // Reserva o card completo (mín. 260) abaixo; foto pega o resto.
      const photoH = Math.min(340, Math.max(180, span - 40 - 260 - 28));
      photo = photoFill(ctx, ctx.input.primaryImageUrl, 140, cardY, 800, photoH, "svcClip");
      cardY += photoH + 28;
    }
    const cardH = Math.min(430, ctx.ctaY - cardY - 40);
    let card = `<rect x="120" y="${cardY}" width="840" height="${cardH}" rx="32" fill="${ctx.surface}" stroke="${ctx.accent}" stroke-width="2.5" />
<rect x="120" y="${cardY}" width="840" height="10" rx="5" fill="${ctx.accent}" />`;
    if (svc) {
      card += `<text x="540" y="${cardY + cardH * 0.34}" font-family="${FONT_FAMILY}" font-size="46" font-weight="800" fill="${ctx.fg}" text-anchor="middle">${escapeXml(truncate(svc.name, 22))}</text>
<text x="540" y="${cardY + cardH * 0.66}" font-family="${FONT_FAMILY}" font-size="110" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(formatBRL(svc.price))}</text>
<text x="540" y="${cardY + cardH - 44}" font-family="${FONT_FAMILY}" font-size="22" font-weight="600" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
    } else {
      card += `<text x="540" y="${cardY + cardH / 2}" font-family="${FONT_FAMILY}" font-size="40" font-weight="800" fill="${ctx.fg}" text-anchor="middle">Serviço em destaque</text>`;
    }
    return title.svg + photo + card;
  },

  "antes-depois": (ctx) => {
    const title = titleBlock(ctx, ctx.top + 52, 44);
    const panelY = title.bottom + 32;
    const panelH = Math.min(520, ctx.ctaY - panelY - 100);
    const left = photoPanel(ctx, ctx.input.primaryImageUrl, 84, panelY, 436, panelH, "beforeClip", "Adicione a foto do antes");
    const right = photoPanel(ctx, ctx.input.secondaryImageUrl, 560, panelY, 436, panelH, "afterClip", "Adicione a foto do depois");
    const labelY = panelY + panelH + 16;
    return `${title.svg}${left}${right}
<rect x="188" y="${labelY}" width="228" height="46" rx="23" fill="${ctx.surface}" stroke="${ctx.border}" stroke-width="1.5" />
<text x="302" y="${labelY + 31}" font-family="${FONT_FAMILY}" font-size="20" font-weight="800" fill="${ctx.muted}" text-anchor="middle" letter-spacing="3">ANTES</text>
<rect x="664" y="${labelY}" width="228" height="46" rx="23" fill="${ctx.accent}" />
<text x="778" y="${labelY + 31}" font-family="${FONT_FAMILY}" font-size="20" font-weight="800" fill="${ctx.accentFg}" text-anchor="middle" letter-spacing="3">DEPOIS</text>`;
  },

  "transformacao": (ctx) => {
    const photoY = ctx.top + 24;
    // Reserva o título (≤2 linhas) abaixo da faixa de acento; foto pega o resto.
    const titleReserve = 78 + ctx.titleLines.length * 62 + 30;
    const photoH = Math.min(600, Math.max(220, ctx.ctaY - photoY - titleReserve));
    const photo = photoPanel(ctx, ctx.input.primaryImageUrl, 84, photoY, 912, photoH, "resultClip", "Adicione a foto do resultado");
    const bandY = photoY + photoH - 4;
    const title = titleBlock(ctx, Math.min(bandY + 74, ctx.ctaY - 30 - ctx.titleLines.length * 62), 48);
    return `${photo}
<rect x="84" y="${bandY}" width="912" height="8" rx="4" fill="${ctx.accent}" />
${badge(ctx, 540, photoY + 20, "TRANSFORMAÇÃO")}
${title.svg}`;
  },

  "profissional-destaque": (ctx) => {
    const span = ctx.ctaY - ctx.top;
    const cy = ctx.top + Math.round(span * 0.36);
    const r = 190;
    const photo = ctx.input.primaryImageUrl?.startsWith("data:image")
      ? `<clipPath id="proClip"><circle cx="540" cy="${cy}" r="${r}" /></clipPath>
<image href="${escapeXml(ctx.input.primaryImageUrl)}" x="${540 - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#proClip)" />`
      : `<circle cx="540" cy="${cy}" r="${r}" fill="${ctx.surface}" stroke="${ctx.border}" stroke-width="1.5" />
<circle cx="540" cy="${cy - 40}" r="56" fill="${ctx.accent}" opacity="0.45" />
<path d="M 420 ${cy + 130} a 120 120 0 0 1 240 0 z" fill="${ctx.accent}" opacity="0.45" />`;
    const title = titleBlock(ctx, cy + r + 84, 54);
    const noteY = Math.min(title.bottom + 40, ctx.ctaY - 32);
    return `<circle cx="540" cy="${cy}" r="${r + 14}" fill="none" stroke="${ctx.accent}" stroke-width="4" />
${photo}
${badge(ctx, 540, ctx.top + 8, "QUEM ATENDE VOCÊ")}
${title.svg}
<text x="540" y="${noteY}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
  },

  "depoimento": (ctx) => {
    // Mensagem/avaliação real em destaque — sem estrelas fictícias nem autoria inventada.
    const span = ctx.ctaY - ctx.top;
    const quoteY = ctx.top + Math.round(span * 0.34);
    const title = titleBlock(ctx, quoteY + 90, 46);
    const noteY = Math.min(title.bottom + 96, ctx.ctaY - 40);
    return `<text x="540" y="${quoteY}" font-family="${FONT_FAMILY}" font-size="180" font-weight="800" fill="${ctx.accent}" text-anchor="middle" opacity="0.9">&#8220;</text>
${title.svg}
${kicker(ctx, 540, noteY, `${ctx.hoursKicker} · ${ctx.scheduleLabel}`, "middle")}`;
  },

  "menu-servicos": (ctx) => {
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "menuPromoBg");
      const title = titleBlock(ctx, ctx.top + 74, 42);
      const list = ctx.services.slice(0, 4);
      const listY = title.bottom + 90;
      const rows = list
        .map(
          (service, i) =>
            `<text x="260" y="${listY + i * 104}" font-family="${FONT_FAMILY}" font-size="28" font-weight="800" fill="${ctx.fg}">${escapeXml(truncate(service.name, 24))}</text>
<text x="790" y="${listY + i * 104}" font-family="${FONT_FAMILY}" font-size="28" font-weight="800" fill="${ctx.accent}" text-anchor="end">${escapeXml(formatBRL(service.price))}</text>`
        )
        .join("");
      return `${bg}
${title.svg}
${rows}`;
    }
    const title = titleBlock(ctx, ctx.top + 52, 44);
    const list = ctx.services.slice(0, 5);
    const rowH = Math.min(92, Math.floor((ctx.ctaY - title.bottom - 60) / Math.max(list.length, 1)));
    const services = serviceRows(ctx, title.bottom + 36, list, rowH);
    return title.svg + `<rect x="100" y="${title.bottom + 16}" width="880" height="3" fill="${ctx.accent}" opacity="0.6" />` + services.svg;
  },

  "horario-especial": (ctx) => {
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "hoursPromoBg");
      const title = titleBlock(ctx, ctx.top + 170, 52);
      return `${bg}
${badge(ctx, 280, ctx.top + 52, ctx.hoursKicker)}
${title.svg}
<text x="540" y="${Math.min(title.bottom + 86, ctx.ctaY - 80)}" font-family="${FONT_FAMILY}" font-size="40" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
    }
    const title = titleBlock(ctx, ctx.top + 56, 46);
    const cy = title.bottom + Math.round((ctx.ctaY - title.bottom) * 0.42);
    return `${title.svg}
<circle cx="540" cy="${cy}" r="120" fill="none" stroke="${ctx.accent}" stroke-width="8" />
<line x1="540" y1="${cy}" x2="540" y2="${cy - 70}" stroke="${ctx.fg}" stroke-width="10" stroke-linecap="round" />
<line x1="540" y1="${cy}" x2="588" y2="${cy + 28}" stroke="${ctx.accent}" stroke-width="10" stroke-linecap="round" />
<text x="540" y="${cy + 210}" font-family="${FONT_FAMILY}" font-size="56" font-weight="800" fill="${ctx.fg}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>
<text x="540" y="${cy + 258}" font-family="${FONT_FAMILY}" font-size="24" font-weight="700" fill="${ctx.accent}" text-anchor="middle" letter-spacing="4">${ctx.hoursKicker}</text>`;
  },

  "novidade": (ctx) => {
    const cy = ctx.top + Math.round((ctx.ctaY - ctx.top) * 0.3);
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "newPromoBg");
      const title = titleBlock(ctx, ctx.top + 220, 58);
      return `${bg}
${badge(ctx, 250, ctx.top + 42, "NOVO")}
<rect x="112" y="${ctx.top + 144}" width="856" height="360" rx="44" fill="${ctx.isLight ? "#FBF8EF" : "#111714"}" opacity="0.86" stroke="${ctx.accent}" stroke-width="2" />
${title.svg}
<text x="540" y="${Math.min(title.bottom + 54, ctx.ctaY - 40)}" font-family="${FONT_FAMILY}" font-size="24" font-weight="700" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
    }
    if (isRealPhoto(ctx.input.primaryImageUrl)) {
      // Orçamento: reserva selo NOVO (112, rotacionado ±) + título abaixo; foto pega o resto.
      const titleH = ctx.titleLines.length * 75; // 58px * 1.3
      const belowReserve = 48 + 128 + 92 + titleH + 24;
      const photoH = Math.min(ctx.format === "story" ? 560 : 400, Math.max(220, ctx.ctaY - ctx.top - belowReserve));
      const photo = photoFill(ctx, ctx.input.primaryImageUrl, 84, ctx.top + 8, 912, photoH, "newClip");
      const badgeY = ctx.top + 8 + photoH + 48;
      const title = titleBlock(ctx, badgeY + 128 + 92, 58);
      return `${photo}
<g transform="rotate(-8 540 ${badgeY + 56})">
  <rect x="380" y="${badgeY}" width="320" height="112" rx="24" fill="${ctx.accent}" />
  <text x="540" y="${badgeY + 78}" font-family="${FONT_FAMILY}" font-size="60" font-weight="800" fill="${ctx.accentFg}" text-anchor="middle" letter-spacing="6">NOVO</text>
</g>
${title.svg}`;
    }
    const title = titleBlock(ctx, cy + 190, 58);
    return `<g transform="rotate(-8 540 ${cy})">
  <rect x="380" y="${cy - 56}" width="320" height="112" rx="24" fill="${ctx.accent}" />
  <text x="540" y="${cy + 22}" font-family="${FONT_FAMILY}" font-size="60" font-weight="800" fill="${ctx.accentFg}" text-anchor="middle" letter-spacing="6">NOVO</text>
</g>
<circle cx="220" cy="${cy - 90}" r="7" fill="${ctx.accent}" /><circle cx="860" cy="${cy - 60}" r="10" fill="${ctx.accent}" opacity="0.6" /><circle cx="790" cy="${cy + 110}" r="6" fill="${ctx.accent}" /><circle cx="270" cy="${cy + 90}" r="9" fill="${ctx.accent}" opacity="0.5" />
${title.svg}
<text x="540" y="${title.bottom + 44}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
  },

  "editorial-minimalista": (ctx) => {
    const span = ctx.ctaY - ctx.top;
    // Reserva do bloco tipográfico abaixo da foto: linha, kicker, título (≤2 linhas) e lista (≤2 itens).
    const titleH = ctx.titleLines.length * 73; // 56px * 1.3
    const itemCount = Math.min(ctx.services.length, 2);
  const belowReserve = 48 + 32 + 80 + titleH + 60 + Math.max(0, itemCount - 1) * 56 + 30;
    let photoBlock = "";
    let photoY = 0;
    if (isRealPhoto(ctx.input.primaryImageUrl)) {
      // Foto obrigatória deste modelo: moldura editorial no topo, altura = sobra do orçamento.
      const photoH = Math.min(ctx.format === "story" ? 640 : 440, Math.max(200, span - belowReserve));
      photoBlock = photoFill(ctx, ctx.input.primaryImageUrl, 100, ctx.top, 880, photoH, "edClip", 8);
      photoY = photoH + 48;
    }
    const midTop = ctx.top + photoY + 32;
  const title = titleBlock(ctx, midTop + 80, 56);
    const svc = ctx.services.slice(0, 2);
    const list = svc
      .map(
        (s, i) =>
          `<text x="140" y="${title.bottom + 60 + i * 56}" font-family="${FONT_FAMILY}" font-size="26" font-weight="600" fill="${ctx.fg}">${escapeXml(truncate(s.name, 28))}</text>
<text x="940" y="${title.bottom + 60 + i * 56}" font-family="${FONT_FAMILY}" font-size="26" font-weight="700" fill="${ctx.accent}" text-anchor="end">${escapeXml(formatBRL(s.price))}</text>
<line x1="140" y1="${title.bottom + 76 + i * 56}" x2="940" y2="${title.bottom + 76 + i * 56}" stroke="${ctx.border}" stroke-width="1.5" />`
      )
      .join("");
    return `${photoBlock}
<line x1="140" y1="${midTop}" x2="940" y2="${midTop}" stroke="${ctx.fg}" stroke-width="2" />
<text x="140" y="${midTop + 44}" font-family="${FONT_FAMILY}" font-size="20" font-weight="700" fill="${ctx.muted}" letter-spacing="5">${ctx.hoursKicker} · ${escapeXml(ctx.scheduleLabel)}</text>
${title.svg}
${list}`;
  },

  // ——— Novos modelos editoriais (TEMPLATE_VERSION 2) ———

  /**
   * Editorial com foto: moldura grande no topo; abaixo, kicker, título forte
   * e detalhes enxutos. A altura da foto é calculada DEPOIS de reservar todo
   * o bloco tipográfico — texto nunca é sobreposto empurrado para cima.
   */
  "editorial-foto": (ctx) => {
    const span = ctx.ctaY - ctx.top;
    const svc = ctx.services.slice(0, 2);
    const titleH = ctx.titleLines.length * 70; // 54px * 1.3
    // Bloco de texto: kicker → título → filete → lista.
    const textBlockH = 84 + titleH + 40 + 60 + svc.length * 52;
    const marginBottom = 30;
    let photo = "";
    let textTop: number;
    if (isRealPhoto(ctx.input.primaryImageUrl)) {
      const photoH = Math.min(
        ctx.format === "story" ? 640 : 460,
        Math.max(200, span - textBlockH - 72 - marginBottom)
      );
      photo = photoFill(ctx, ctx.input.primaryImageUrl, 84, ctx.top, 912, photoH, "edfClip", 28);
      textTop = ctx.top + photoH + 72;
    } else {
      textTop = ctx.top + Math.max(24, Math.round((span - textBlockH - marginBottom) / 2));
    }
    const titleY = textTop + 84;
    const title = titleBlock(ctx, titleY, 54, "start", 120);
    const ruleY = title.bottom + 40;
    const listY = ruleY + 60;
    const list = svc
      .map(
        (s, i) =>
          `<text x="120" y="${listY + i * 52}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${ctx.muted}">${escapeXml(truncate(s.name, 30))}</text>
<text x="960" y="${listY + i * 52}" font-family="${FONT_FAMILY}" font-size="24" font-weight="700" fill="${ctx.fg}" text-anchor="end">${escapeXml(formatBRL(s.price))}</text>`
      )
      .join("");
    return `${photo}
${kicker(ctx, 120, textTop, `${ctx.hoursKicker} · ${ctx.scheduleLabel}`)}
${title.svg}
${hrule(ctx, 120, 960, ruleY, 0.9)}
${list}`;
  },

  /**
   * Capa de impacto: com foto ela vira fundo full-bleed com véu escuro e
   * título gigante de capa. Sem foto: capa tipográfica com filetes.
   */
  "capa-impacto": (ctx) => {
    const span = ctx.ctaY - ctx.top;
    const hasPhoto = isRealPhoto(ctx.input.primaryImageUrl);
    const fg = hasPhoto ? "#FAFAF6" : ctx.fg;
    const mutedC = hasPhoto ? "#E7E4DC" : ctx.muted;
    const photo = hasPhoto
      ? `${photoFill(ctx, ctx.input.primaryImageUrl, 0, 0, 1080, ctx.height, "capaClip", 0, false)}
<rect x="0" y="0" width="1080" height="${ctx.height}" fill="#0B0F0C" opacity="0.58" />
<rect x="0" y="${Math.round(ctx.height * 0.55)}" width="1080" height="${ctx.height - Math.round(ctx.height * 0.55)}" fill="url(#capaShade)" />`
      : "";
    const defs = hasPhoto
      ? `<linearGradient id="capaShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0B0F0C" stop-opacity="0" /><stop offset="100%" stop-color="#0B0F0C" stop-opacity="0.85" /></linearGradient>`
      : "";
    const masthead = hasPhoto
      ? `${isRealPhoto(ctx.input.logoUrl) ? `<image href="${escapeXml(ctx.input.logoUrl!)}" x="516" y="36" width="48" height="48" preserveAspectRatio="xMidYMid meet" />` : ""}
<text x="540" y="${isRealPhoto(ctx.input.logoUrl) ? 116 : 84}" font-family="${FONT_FAMILY}" font-size="24" font-weight="800" fill="#FAFAF6" text-anchor="middle" letter-spacing="5">${escapeXml(truncate(ctx.input.shopName, 34).toUpperCase())}</text>`
      : "";
    // Bloco ancorado na base: kicker → filete → título (64px, ≤2 linhas) → horário.
    // Altura calculada antes; nada passa de ctaY-30 e 64px cabe na largura útil.
    const lh = 84; // 64px * ~1.3
    const lines = ctx.titleLines.length;
    const blockH = 28 + 20 + 56 + lines * lh - lh + 84; // kicker asc + filete + gap + baselines + horário
    const bandTop = hasPhoto
      ? ctx.ctaY - 30 - blockH
      : ctx.top + Math.max(40, Math.round((span - blockH - 30) / 2));
    const firstBase = bandTop + 28 + 20 + 56;
    const title = ctx.titleLines
      .map(
        (line, i) =>
          `<text x="96" y="${firstBase + i * lh}" font-family="${FONT_FAMILY}" font-size="64" font-weight="800" fill="${fg}" letter-spacing="0.5">${line}</text>`
      )
      .join("");
    const lastBase = firstBase + (lines - 1) * lh;
    return `${defs}${photo}${masthead}
${kicker({ ...ctx, accent: hasPhoto ? "#BFD8CE" : ctx.accent }, 96, bandTop, hasPhoto ? ctx.hoursKicker : ctx.input.shopName)}
<line x1="96" y1="${bandTop + 20}" x2="316" y2="${bandTop + 20}" stroke="${hasPhoto ? "#BFD8CE" : ctx.accent}" stroke-width="3" />
${title}
<text x="96" y="${lastBase + 52}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${mutedC}">${escapeXml(ctx.scheduleLabel)}</text>`;
  },

  /**
   * Revista de beleza: manchete estilo revista — fio fino no topo, título
   * elegante à esquerda, foto em coluna à direita (ou texto pleno sem foto).
   */
  "revista-beleza": (ctx) => {
    const hasPhoto = isRealPhoto(ctx.input.primaryImageUrl);
    const journalY = ctx.ctaY - 52;  // linha de rodapé ancorada acima do CTA
    const ruleBottomY = journalY - 44;
    // Manchete: kicker → título (62px, ≤2 linhas).
    const firstBase = ctx.top + 180;
    const lh = 78;
    const headline = ctx.titleLines
      .map(
        (line, i) =>
          `<text x="120" y="${firstBase + i * lh}" font-family="${FONT_FAMILY}" font-size="62" font-weight="800" fill="${ctx.fg}">${line}</text>`
      )
      .join("");
    const lastBase = firstBase + (ctx.titleLines.length - 1) * lh;
    const svc = ctx.services[0];
    const footerLine = svc
      ? `${escapeXml(truncate(svc.name, 30))} · ${escapeXml(formatBRL(svc.price))}`
      : escapeXml(ctx.scheduleLabel);
    if (hasPhoto) {
      // Foto pega o espaço entre a manchete e a regra de rodapé — ambos reservados antes.
      const photoY = lastBase + 72;
      const photoH = Math.max(200, ruleBottomY - 16 - photoY);
      const photo = photoFill(ctx, ctx.input.primaryImageUrl, 120, photoY, 840, photoH, "revClip", 4);
      return `${hrule(ctx, 120, 960, ctx.top + 40)}
${kicker(ctx, 120, ctx.top + 88, `${ctx.hoursKicker} · ${ctx.scheduleLabel}`)}
${headline}
${photo}
${hrule(ctx, 120, 960, ruleBottomY, 0.7)}
<text x="120" y="${journalY}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${ctx.muted}">${footerLine}</text>`;
    }
    return `${hrule(ctx, 120, 960, ctx.top + 40)}
${kicker(ctx, 120, ctx.top + 88, `${ctx.hoursKicker} · ${ctx.scheduleLabel}`)}
${headline}
${hrule(ctx, 120, 960, lastBase + 72, 0.7)}
<text x="120" y="${Math.min(lastBase + 128, ctx.ctaY - 40)}" font-family="${FONT_FAMILY}" font-size="26" font-weight="600" fill="${ctx.muted}">${footerLine}</text>`;
  },

  /** Tipográfico: só tipo — título grande centralizado entre filetes. */
  "tipografico": (ctx) => {
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "typePromoBg");
      const span = ctx.ctaY - ctx.top;
      const cy = ctx.top + Math.round(span / 2) - 40;
      const lines = wrapTitle(ctx.input.title || "Vem pra cá hoje!").map(escapeXml);
      const body = lines
        .map(
          (line, i) =>
            `<text x="540" y="${cy + i * 82}" font-family="${FONT_FAMILY}" font-size="68" font-weight="800" fill="${ctx.fg}" text-anchor="middle">${line}</text>`
        )
        .join("");
      return `${bg}
${kicker(ctx, 540, ctx.top + 72, ctx.hoursKicker, "middle")}
${body}
<text x="540" y="${Math.min(cy + lines.length * 82 + 56, ctx.ctaY - 38)}" font-family="${FONT_FAMILY}" font-size="24" font-weight="700" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
    }
    const span = ctx.ctaY - ctx.top;
    const cy = ctx.top + Math.round(span / 2) - 60;
    const lines = wrapTitle(ctx.input.title || "Vem pra cá hoje!").map(escapeXml);
    const body = lines
      .map(
        (line, i) =>
          `<text x="540" y="${cy + i * 92}" font-family="${FONT_FAMILY}" font-size="76" font-weight="800" fill="${ctx.fg}" text-anchor="middle" letter-spacing="1">${line}</text>`
      )
      .join("");
    return `${kicker(ctx, 540, cy - 150, ctx.hoursKicker, "middle")}
${hrule(ctx, 200, 880, cy - 110, 0.9)}
${body}
${hrule(ctx, 200, 880, cy + (lines.length - 1) * 92 + 46, 0.9)}
<text x="540" y="${cy + (lines.length - 1) * 92 + 104}" font-family="${FONT_FAMILY}" font-size="26" font-weight="600" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
  },

  /** Oferta clean: moldura fina, preço gigante, poucos elementos. */
  "oferta-clean": (ctx) => {
    const svc = ctx.services[0];
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "offerCleanBg");
      const title = titleBlock(ctx, ctx.top + 76, 40);
      const cy = title.bottom + 220;
      const price = svc
        ? `<text x="540" y="${cy - 32}" font-family="${FONT_FAMILY}" font-size="38" font-weight="800" fill="${ctx.fg}" text-anchor="middle">${escapeXml(truncate(svc.name, 24))}</text>
<text x="540" y="${cy + 82}" font-family="${FONT_FAMILY}" font-size="112" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(formatBRL(svc.price))}</text>`
        : `<text x="540" y="${cy + 40}" font-family="${FONT_FAMILY}" font-size="72" font-weight="800" fill="${ctx.accent}" text-anchor="middle">Oferta especial</text>`;
      return `${bg}
${title.svg}
<rect x="150" y="${title.bottom + 64}" width="780" height="360" rx="38" fill="${ctx.isLight ? "#FBF8EF" : "#101512"}" opacity="0.9" stroke="${ctx.accent}" stroke-width="2" />
${kicker(ctx, 540, title.bottom + 122, "Oferta", "middle")}
${price}`;
    }
    if (isRealPhoto(ctx.input.primaryImageUrl)) {
      const photoH = Math.min(ctx.format === "story" ? 640 : 430, Math.max(240, ctx.ctaY - ctx.top - 420));
      const photo = photoFill(ctx, ctx.input.primaryImageUrl, 90, ctx.top + 8, 900, photoH, "offerPhoto", 30);
      const title = titleBlock(ctx, ctx.top + photoH + 92, 40);
      // O orçamento fixo do photoH (-420) não acompanha a altura do título, que
      // varia com o nº de linhas. Com título longo o preço estourava a faixa do
      // CTA; trava o baseline abaixo de ctaY e mantém o nome acima do preço.
      const priceY = Math.min(title.bottom + 210, ctx.ctaY - 24);
      const price = svc
        ? `<text x="540" y="${Math.min(title.bottom + 96, priceY - 95)}" font-family="${FONT_FAMILY}" font-size="38" font-weight="800" fill="${ctx.fg}" text-anchor="middle">${escapeXml(truncate(svc.name, 24))}</text>
<text x="540" y="${priceY}" font-family="${FONT_FAMILY}" font-size="110" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(formatBRL(svc.price))}</text>`
        : `<text x="540" y="${Math.min(title.bottom + 150, ctx.ctaY - 24)}" font-family="${FONT_FAMILY}" font-size="72" font-weight="800" fill="${ctx.accent}" text-anchor="middle">Oferta especial</text>`;
      return `${photo}
${title.svg}
${price}`;
    }
    const span = ctx.ctaY - ctx.top;
    const cy = ctx.top + Math.round(span / 2) - 40;
    const price = svc
      ? `<text x="540" y="${cy + 74}" font-family="${FONT_FAMILY}" font-size="120" font-weight="800" fill="${ctx.accent}" text-anchor="middle">${escapeXml(formatBRL(svc.price))}</text>
<text x="540" y="${cy - 12}" font-family="${FONT_FAMILY}" font-size="34" font-weight="700" fill="${ctx.fg}" text-anchor="middle">${escapeXml(truncate(svc.name, 24))}</text>`
      : `<text x="540" y="${cy + 40}" font-family="${FONT_FAMILY}" font-size="72" font-weight="800" fill="${ctx.accent}" text-anchor="middle">Oferta especial</text>`;
    const title = titleBlock(ctx, ctx.top + 96, 40);
    return `${title.svg}
${kicker(ctx, 540, cy - 132, "Oferta", "middle")}
${price}
${hrule(ctx, 340, 740, cy + 128, 0.5)}
<text x="540" y="${cy + 176}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
  },

  /** Recado do studio: cartão de aviso elegante e direto. */
  "recado-studio": (ctx) => {
    if (ctx.input.illustrativeBackground && isRealPhoto(ctx.input.primaryImageUrl)) {
      const bg = fullBleedImage(ctx, ctx.input.primaryImageUrl, "noticePromoBg");
      const title = titleBlock(ctx, ctx.top + 190, 46);
      return `${bg}
${kicker(ctx, 300, ctx.top + 88, "Recado do studio", "middle")}
${title.svg}
<text x="540" y="${Math.min(title.bottom + 60, ctx.ctaY - 42)}" font-family="${FONT_FAMILY}" font-size="24" font-weight="700" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
    }
    const span = ctx.ctaY - ctx.top;
    const cardH = Math.min(460, span - 120);
    const cardY = ctx.top + Math.round((span - cardH) / 2);
    const lines = ctx.titleLines;
    const body = lines
      .map(
        (line, i) =>
          `<text x="540" y="${cardY + 168 + i * 60}" font-family="${FONT_FAMILY}" font-size="44" font-weight="800" fill="${ctx.fg}" text-anchor="middle">${line}</text>`
      )
      .join("");
    return `<rect x="140" y="${cardY}" width="800" height="${cardH}" rx="8" fill="${ctx.surface}" stroke="${ctx.border}" stroke-width="1.5" />
<rect x="140" y="${cardY}" width="800" height="6" fill="${ctx.accent}" />
${kicker(ctx, 540, cardY + 92, "Recado do studio", "middle")}
${body}
<text x="540" y="${cardY + cardH - 64}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
  },
};

TEMPLATE_LAYOUTS["promocao-cobre"] = TEMPLATE_LAYOUTS["promocao-relampago"];
TEMPLATE_LAYOUTS["combo-premium"] = TEMPLATE_LAYOUTS["oferta-clean"];
TEMPLATE_LAYOUTS["agenda-premium"] = TEMPLATE_LAYOUTS["ultimas-vagas"];
TEMPLATE_LAYOUTS["beleza-luxo"] = TEMPLATE_LAYOUTS["novidade"];
TEMPLATE_LAYOUTS["gift-card"] = TEMPLATE_LAYOUTS["oferta-clean"];
TEMPLATE_LAYOUTS["fidelidade"] = TEMPLATE_LAYOUTS["servico-destaque"];
TEMPLATE_LAYOUTS["avaliacao-clientes"] = TEMPLATE_LAYOUTS["oferta-clean"];
TEMPLATE_LAYOUTS["lancamento-premium"] = TEMPLATE_LAYOUTS["novidade"];

/** Métricas verticais do layout (usado pelo renderer e por testes de bounds). */
export function postLayoutMetrics(input: PostSvgInput): {
  height: number;
  shopY: number;
  top: number;
  ctaY: number;
  footerY: number;
} {
  const format = input.format ?? "square";
  const height = format === "portrait" ? 1350 : format === "story" ? 1920 : 1080;
  const storyPad = format === "story" ? 120 : 0;
  const hasLogo = Boolean(input.logoUrl?.startsWith("data:image"));
  const shopY = (hasLogo ? 168 : 92) + storyPad;
  const ctaY = height - 180 - storyPad;
  return { height, shopY, top: shopY + 40, ctaY, footerY: format === "story" ? ctaY + 124 : height - 30 };
}

/**
 * SVG 1080 wide, format-dependent height (1080/1350/1920).
 * Identidade principal = salão (logo + nome no topo). Assinatura da
 * plataforma fica pequena e discreta no rodapé.
 * Format-specific layouts, focal point, safe margins de story,
 * template version tracking.
 */
export function buildPostSvg(input: PostSvgInput): string {
  const palette: PostPalette = getPostPalette(input.paletteKey);
  const shopName = escapeXml(truncate(input.shopName, 34).toUpperCase());
  const templateKey = input.templateKey ?? "agenda-aberta";
  const format = input.format ?? "square";
  const height = format === "portrait" ? 1350 : format === "story" ? 1920 : 1080;
  const accent = palette.accent;
  const fg = palette.foreground;
  const muted = palette.muted;

  const metrics = postLayoutMetrics(input);
  const storyPad = format === "story" ? 120 : 0;

  // Identidade principal do salão: logo (dataURL) + nome no topo.
  const hasLogo = Boolean(input.logoUrl?.startsWith("data:image"));
  const logoBlock = hasLogo
    ? `<image href="${escapeXml(input.logoUrl!)}" x="504" y="${44 + storyPad}" width="72" height="72" preserveAspectRatio="xMidYMid meet" />`
    : "";

  const shopY = metrics.shopY;
  const ctaY = metrics.ctaY;
  const footerY = metrics.footerY;

  const focalX = input.designOptions?.focalX ?? 50;
  const focalY = input.designOptions?.focalY ?? 50;
  const overlayOpacity = Math.max(0.05, Math.min(0.6, ((input.designOptions?.overlay ?? 30) / 100)));

  const ctx: LayoutCtx = {
    input,
    accent,
    accentFg: palette.accentForeground,
    fg,
    muted,
    surface: palette.surface,
    border: palette.border,
    isLight: palette.isLight,
    height,
    width: 1080,
    format,
    top: metrics.top,
    ctaY,
    titleLines: wrapTitle(input.title || "Vem pra cá hoje!").map(escapeXml),
    ctaText: escapeXml(truncate(input.ctaText || "Agende agora", 32)),
    scheduleLabel: input.todaySchedule?.isOpen
      ? `${input.todaySchedule.openTime}  –  ${input.todaySchedule.closeTime}`
      : "Consulte nossos horários",
    hoursKicker: input.todaySchedule?.isOpen ? "HOJE" : "HORÁRIOS",
    services: input.services.filter((s) => s.name?.trim()),
    focalX,
    focalY,
    overlayOpacity,
  };

  const layout = TEMPLATE_LAYOUTS[templateKey] ?? TEMPLATE_LAYOUTS["agenda-aberta"];
  const middle = layout(ctx);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" data-template-key="${escapeXml(templateKey)}" data-template-version="${TEMPLATE_VERSION}">
  <defs>
    <radialGradient id="glowTR" cx="0.9" cy="0.05" r="0.48">
      <stop offset="0%" stop-color="${accent}" stop-opacity="${palette.isLight ? 0.08 : 0.2}" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1080" height="${height}" fill="${palette.background}" />
  <rect width="1080" height="${height}" fill="url(#glowTR)" />
  <rect width="1080" height="6" fill="${accent}" />
  ${logoBlock}
  <text x="540" y="${shopY}" font-family="${FONT_FAMILY}" font-size="30" font-weight="800" fill="${fg}" text-anchor="middle" letter-spacing="4">${shopName}</text>
  ${middle}
  <g>
    <rect x="170" y="${ctaY}" width="740" height="88" rx="44" fill="${accent}" />
    <text x="540" y="${ctaY + 56}" font-family="${FONT_FAMILY}" font-size="30" font-weight="800" fill="${palette.accentForeground}" text-anchor="middle">${ctx.ctaText}</text>
  </g>
  <text x="540" y="${footerY}" font-family="${FONT_FAMILY}" font-size="16" font-weight="600" fill="${muted}" text-anchor="middle" opacity="0.75">Feito com ${escapeXml(BRAND_NAME)} · agendai.app</text>
</svg>`;
}

/**
 * Render SVG → PNG pelo pool de worker threads (B24).
 *
 * A assinatura mudou de síncrona para `Promise<Buffer>`: o Resvg sai do event
 * loop da API, mas o PNG retornado continua byte a byte o mesmo. Falhas chegam
 * como `AppError` (503 para timeout/morte do worker, 500 para erro de render).
 */
export function renderPostSvgToPng(svg: string): Promise<Buffer> {
  return renderSvgToPng(svg);
}

export function pngToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}
