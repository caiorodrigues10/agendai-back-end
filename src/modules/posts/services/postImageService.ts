import fs from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
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
};

const FONT_FAMILY = "Open Sans";
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

/** New wordmark: clean "agendai" text, no teal box. */
function agendaiWordmark(cx: number, cy: number, textColor: string): string {
  return `<text x="${cx}" y="${cy + 11}" font-family="${FONT_FAMILY}" font-size="32" font-weight="800" fill="${textColor}" text-anchor="middle" letter-spacing="-1">agendai</text>`;
}

function resolvePostFontFile(): string | null {
  const here = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  const candidates = [
    path.join(here, "../fonts/OpenSans-Bold.ttf"),
    path.join(process.cwd(), "src/modules/posts/fonts/OpenSans-Bold.ttf"),
    path.join(process.cwd(), "dist/modules/posts/fonts/OpenSans-Bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
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
    // Focal point: compute image offset for controlled framing
    const fx = (ctx.focalX - 50) / 100; // -0.5 to 0.5
    const fy = (ctx.focalY - 50) / 100;
    const imgX = x + fx * w * 0.3;
    const imgY = y + fy * h * 0.3;
    return `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" /></clipPath>
<image href="${escapeXml(href)}" x="${imgX}" y="${imgY}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="#000" opacity="${overlay}" />
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="none" stroke="${ctx.border}" stroke-width="1.5" />`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${ctx.surface}" stroke="${ctx.border}" stroke-width="1.5" />
<circle cx="${x + w / 2}" cy="${y + h / 2 - 14}" r="34" fill="none" stroke="${ctx.accent}" stroke-width="3" opacity="0.55" />
<path d="M ${x + w / 2 - 14} ${y + h / 2 - 20} l 28 0 l -14 20 z" fill="${ctx.accent}" opacity="0.55" />
${placeholderLabel ? `<text x="${x + w / 2}" y="${y + h / 2 + 52}" font-family="${FONT_FAMILY}" font-size="20" font-weight="700" fill="${ctx.muted}" text-anchor="middle">${escapeXml(placeholderLabel)}</text>` : ""}`;
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
    const title = titleBlock(ctx, ctx.top + 56);
    const hours = hoursCard(ctx, title.bottom + 28);
    const services = serviceRows(ctx, hours.bottom + 20, ctx.services.slice(0, 3));
    return title.svg + hours.svg + services.svg;
  },

  "ultimas-vagas": (ctx) => {
    const midY = ctx.top + Math.round((ctx.ctaY - ctx.top) * 0.42);
    const title = titleBlock(ctx, ctx.top + 50, 44);
    const hours = hoursCard(ctx, ctx.ctaY - 140, { width: 700, x: 190 });
    return `${title.svg}
${badge(ctx, 540, title.bottom + 24, "CORRE QUE ACABA")}
<text x="540" y="${midY + 150}" font-family="${FONT_FAMILY}" font-size="170" font-weight="800" fill="${ctx.accent}" text-anchor="middle">ÚLTIMAS</text>
<text x="540" y="${midY + 250}" font-family="${FONT_FAMILY}" font-size="96" font-weight="800" fill="${ctx.fg}" text-anchor="middle" letter-spacing="6">VAGAS HOJE</text>
${hours.svg}`;
  },

  "promocao-relampago": (ctx) => {
    const svc = ctx.services[0];
    const title = titleBlock(ctx, ctx.top + 56, 46);
    let y = title.bottom + 36;
    let middle = badge(ctx, 540, y, "SÓ HOJE");
    y += 120;
    middle += `<path d="M 560 ${y - 40} l -52 96 l 40 0 l -30 84 l 84 -110 l -44 0 l 40 -70 z" fill="${ctx.accent}" opacity="0.9" />`;
    if (ctx.format === "story") {
      // Story: photo on top, price below
      const photo = photoPanel(ctx, ctx.input.primaryImageUrl, 84, ctx.top + 24, 912, 400, "promoClip", "Adicione a foto da promoção");
      return `${photo}${title.svg}${middle}`;
    }
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
    const title = titleBlock(ctx, ctx.top + 52, 44);
    const cardY = title.bottom + 40;
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
    return title.svg + card;
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
    const photoH = Math.min(600, ctx.ctaY - photoY - 140);
    const photo = photoPanel(ctx, ctx.input.primaryImageUrl, 84, photoY, 912, photoH, "resultClip", "Adicione a foto do resultado");
    const bandY = photoY + photoH - 4;
    const title = titleBlock(ctx, bandY + 74, 48);
    return `${photo}
<rect x="84" y="${bandY}" width="912" height="8" rx="4" fill="${ctx.accent}" />
${badge(ctx, 540, photoY + 20, "TRANSFORMAÇÃO")}
${title.svg}`;
  },

  "profissional-destaque": (ctx) => {
    const cy = ctx.top + Math.round((ctx.ctaY - ctx.top) * 0.38);
    const r = 190;
    const photo = ctx.input.primaryImageUrl?.startsWith("data:image")
      ? `<clipPath id="proClip"><circle cx="540" cy="${cy}" r="${r}" /></clipPath>
<image href="${escapeXml(ctx.input.primaryImageUrl)}" x="${540 - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#proClip)" />`
      : `<circle cx="540" cy="${cy}" r="${r}" fill="${ctx.surface}" stroke="${ctx.border}" stroke-width="1.5" />
<circle cx="540" cy="${cy - 40}" r="56" fill="${ctx.accent}" opacity="0.45" />
<path d="M 420 ${cy + 130} a 120 120 0 0 1 240 0 z" fill="${ctx.accent}" opacity="0.45" />`;
    const title = titleBlock(ctx, cy + r + 84, 54);
    return `<circle cx="540" cy="${cy}" r="${r + 14}" fill="none" stroke="${ctx.accent}" stroke-width="4" />
${photo}
${badge(ctx, 540, ctx.top + 8, "QUEM ATENDE VOCÊ")}
${title.svg}
<text x="540" y="${title.bottom + 40}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
  },

  "depoimento": (ctx) => {
    const quoteY = ctx.top + 250;
    const title = titleBlock(ctx, quoteY + 90, 46);
    const stars = [0, 1, 2, 3, 4]
      .map((i) => {
        const x = 540 - 110 + i * 55;
        const y = title.bottom + 52;
        return `<path d="M ${x} ${y - 18} l 5.6 11.4 12.6 1.8 -9.1 8.9 2.1 12.5 -11.2 -5.9 -11.2 5.9 2.1 -12.5 -9.1 -8.9 12.6 -1.8 z" fill="${ctx.accent}" />`;
      })
      .join("");
    return `<text x="540" y="${quoteY}" font-family="${FONT_FAMILY}" font-size="180" font-weight="800" fill="${ctx.accent}" text-anchor="middle" opacity="0.9">&#8220;</text>
${title.svg}
${stars}
<text x="540" y="${title.bottom + 120}" font-family="${FONT_FAMILY}" font-size="22" font-weight="600" fill="${ctx.muted}" text-anchor="middle" letter-spacing="2">CLIENTE ${escapeXml(truncate(ctx.input.shopName, 24).toUpperCase())}</text>`;
  },

  "menu-servicos": (ctx) => {
    const title = titleBlock(ctx, ctx.top + 52, 44);
    const list = ctx.services.slice(0, 5);
    const rowH = Math.min(92, Math.floor((ctx.ctaY - title.bottom - 60) / Math.max(list.length, 1)));
    const services = serviceRows(ctx, title.bottom + 36, list, rowH);
    return title.svg + `<rect x="100" y="${title.bottom + 16}" width="880" height="3" fill="${ctx.accent}" opacity="0.6" />` + services.svg;
  },

  "horario-especial": (ctx) => {
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
    const title = titleBlock(ctx, cy + 190, 58);
    // Story: add photo panel
    if (ctx.format === "story") {
      const photo = photoPanel(ctx, ctx.input.primaryImageUrl, 84, ctx.top + 24, 912, 360, "newClip", "Adicione a foto da novidade");
      return `${photo}
<g transform="rotate(-8 540 ${cy + 400})">
  <rect x="380" y="${cy + 344}" width="320" height="112" rx="24" fill="${ctx.accent}" />
  <text x="540" y="${cy + 422}" font-family="${FONT_FAMILY}" font-size="60" font-weight="800" fill="${ctx.accentFg}" text-anchor="middle" letter-spacing="6">NOVO</text>
</g>
${title.svg}`;
    }
    return `<g transform="rotate(-8 540 ${cy})">
  <rect x="380" y="${cy - 56}" width="320" height="112" rx="24" fill="${ctx.accent}" />
  <text x="540" y="${cy + 22}" font-family="${FONT_FAMILY}" font-size="60" font-weight="800" fill="${ctx.accentFg}" text-anchor="middle" letter-spacing="6">NOVO</text>
</g>
<circle cx="220" cy="${cy - 90}" r="7" fill="${ctx.accent}" /><circle cx="860" cy="${cy - 60}" r="10" fill="${ctx.accent}" opacity="0.6" /><circle cx="790" cy="${cy + 110}" r="6" fill="${ctx.accent}" /><circle cx="270" cy="${cy + 90}" r="9" fill="${ctx.accent}" opacity="0.5" />
${title.svg}
<text x="540" y="${title.bottom + 44}" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="${ctx.muted}" text-anchor="middle">${escapeXml(ctx.scheduleLabel)}</text>`;
  },

  "editorial-minimalista": (ctx) => {
    const midTop = ctx.top + 60;
    const title = titleBlock(ctx, midTop + 120, 58);
    const svc = ctx.services.slice(0, 2);
    const list = svc
      .map(
        (s, i) =>
          `<text x="140" y="${title.bottom + 110 + i * 56}" font-family="${FONT_FAMILY}" font-size="26" font-weight="600" fill="${ctx.fg}">${escapeXml(truncate(s.name, 28))}</text>
<text x="940" y="${title.bottom + 110 + i * 56}" font-family="${FONT_FAMILY}" font-size="26" font-weight="700" fill="${ctx.accent}" text-anchor="end">${escapeXml(formatBRL(s.price))}</text>
<line x1="140" y1="${title.bottom + 126 + i * 56}" x2="940" y2="${title.bottom + 126 + i * 56}" stroke="${ctx.border}" stroke-width="1.5" />`
      )
      .join("");
    return `<line x1="140" y1="${midTop}" x2="940" y2="${midTop}" stroke="${ctx.fg}" stroke-width="2" />
<text x="140" y="${midTop + 44}" font-family="${FONT_FAMILY}" font-size="20" font-weight="700" fill="${ctx.muted}" letter-spacing="5">${ctx.hoursKicker} · ${escapeXml(ctx.scheduleLabel)}</text>
${title.svg}
${list}`;
  },
};

/**
 * SVG 1080 wide, format-dependent height.
 * New wordmark: "agendai" in foreground color (no teal box).
 * Format-specific layouts. Focal point support. Template version tracking.
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

  // Logo: render if data URL, otherwise skip (controller fetches external URLs)
  const hasLogo = Boolean(input.logoUrl?.startsWith("data:image"));
  const logoBlock = hasLogo
    ? `<image href="${escapeXml(input.logoUrl!)}" x="508" y="136" width="64" height="64" preserveAspectRatio="xMidYMid meet" />`
    : "";

  const shopY = hasLogo ? 236 : 152;
  const extraOffset = Math.round((height - 1080) / 2);
  const ctaY = height - 172 - Math.round(extraOffset * 0.4);

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
    top: shopY + extraOffset,
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
  <defs>
    <radialGradient id="glowTR" cx="0.9" cy="0.05" r="0.48">
      <stop offset="0%" stop-color="${accent}" stop-opacity="${palette.isLight ? 0.08 : 0.2}" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1080" height="${height}" fill="${palette.background}" />
  <rect width="1080" height="${height}" fill="url(#glowTR)" />
  <rect width="1080" height="6" fill="${accent}" />
  ${agendaiWordmark(540, 78, fg)}
  ${logoBlock}
  <text x="540" y="${shopY}" font-family="${FONT_FAMILY}" font-size="26" font-weight="700" fill="${accent}" text-anchor="middle" letter-spacing="3">${shopName}</text>
  ${middle}
  <g>
    <rect x="170" y="${ctaY}" width="740" height="88" rx="44" fill="${accent}" />
    <text x="540" y="${ctaY + 56}" font-family="${FONT_FAMILY}" font-size="30" font-weight="800" fill="${palette.accentForeground}" text-anchor="middle">${ctx.ctaText}</text>
  </g>
  <text x="540" y="${height - 36}" font-family="${FONT_FAMILY}" font-size="18" font-weight="600" fill="${muted}" text-anchor="middle">agendai.app  ·  fila digital e agenda</text>
</svg>`;
}

export function renderPostSvgToPng(svg: string): Buffer {
  const fontFile = resolvePostFontFile();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    font: {
      fontFiles: fontFile ? [fontFile] : [],
      loadSystemFonts: true,
      defaultFontFamily: FONT_FAMILY,
    },
  });
  return resvg.render().asPng();
}

export function pngToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}
