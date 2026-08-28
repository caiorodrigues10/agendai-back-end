import fs from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";

export type PostSvgInput = {
  shopName: string;
  logoUrl?: string | null;
  services: { name: string; price: number }[];
  todaySchedule: { isOpen: boolean; openTime: string; closeTime: string } | null;
  postMode: "queue" | "appointments" | "both";
  ctaText: string;
  title: string;
};

/** Open Sans (Apache-2.0) — embutida para o PNG renderizar no Render/Linux. */
const FONT_FAMILY = "Open Sans";

const BG = "#0F0F0F";
const BG_MID = "#161616";
const SURFACE = "#212121";
const BORDER = "#303030";
const EMERALD = "#10B981";
const EMERALD_LIGHT = "#34D399";
const EMERALD_FG = "#052E1F";
const TEAL = "#00C2B3";
const TEAL_FG = "#0A0F18";
const TEXT_WHITE = "#F1F1F1";
const TEXT_MUTED = "#AAAAAA";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value
  );
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

/** Wordmark do site: AGEND (branco) sobrepõe o quadrado teal com AI. */
function agendaiWordmark(cx: number, cy: number): string {
  const boxW = 78;
  const boxH = 46;
  const overlap = 16;
  const agendW = 118;
  const totalW = agendW + boxW - overlap;
  const left = cx - totalW / 2;
  const boxX = left + agendW - overlap;
  const boxY = cy - boxH / 2;
  const agendRight = left + agendW;
  return `<g>
  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="10" fill="${TEAL}" />
  <text x="${boxX + boxW / 2}" y="${cy + 10}" font-family="${FONT_FAMILY}" font-size="22" font-weight="800" fill="${TEAL_FG}" text-anchor="middle">AI</text>
  <text x="${agendRight}" y="${cy + 11}" font-family="${FONT_FAMILY}" font-size="32" font-weight="800" fill="${TEXT_WHITE}" text-anchor="end" letter-spacing="-1.6">AGEND</text>
</g>`;
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

/**
 * SVG 1080×1080 no visual do site, com logo AgendAI.
 * Sem fontes da web: o PNG usa o TTF empacotado (resvg).
 */
export function buildPostSvg(input: PostSvgInput): string {
  const shopName = escapeXml(truncate(input.shopName, 34).toUpperCase());
  const titleLines = wrapTitle(input.title || "Vem pra cá hoje!").map(escapeXml);
  const ctaText = escapeXml(truncate(input.ctaText || "Agende agora", 32));

  const scheduleLabel = input.todaySchedule?.isOpen
    ? `${input.todaySchedule.openTime}  –  ${input.todaySchedule.closeTime}`
    : "Consulte nossos horários";
  const hoursKicker = input.todaySchedule?.isOpen ? "HOJE" : "HORÁRIOS";

  const hasLogo = Boolean(input.logoUrl?.startsWith("data:image"));
  const logoBlock = hasLogo
    ? `<clipPath id="logoClip"><circle cx="540" cy="168" r="32" /></clipPath>
  <circle cx="540" cy="168" r="34" fill="none" stroke="${EMERALD}" stroke-width="2.5" />
  <image href="${escapeXml(input.logoUrl!)}" x="508" y="136" width="64" height="64" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : "";

  const shopY = hasLogo ? 228 : 148;
  const titleY0 = shopY + 56;
  const titleSvgs = titleLines
    .map(
      (line, i) =>
        `<text x="540" y="${titleY0 + i * 68}" font-family="${FONT_FAMILY}" font-size="52" font-weight="800" fill="${TEXT_WHITE}" text-anchor="middle">${line}</text>`
    )
    .join("");

  const hoursY = titleY0 + titleLines.length * 68 + 28;
  const shown = input.services.filter((s) => s.name?.trim()).slice(0, 3);
  const servicesStart = hoursY + 108;

  const serviceCards = shown
    .map((service, i) => {
      const y = servicesStart + i * 92;
      return `<g>
  <rect x="100" y="${y}" width="880" height="80" rx="18" fill="${SURFACE}" stroke="${BORDER}" stroke-width="1.5" />
  <rect x="100" y="${y}" width="7" height="80" rx="3" fill="${EMERALD}" />
  <text x="136" y="${y + 50}" font-family="${FONT_FAMILY}" font-size="26" font-weight="600" fill="${TEXT_WHITE}">${escapeXml(
        truncate(service.name, 26)
      )}</text>
  <text x="948" y="${y + 50}" font-family="${FONT_FAMILY}" font-size="26" font-weight="700" fill="${EMERALD_LIGHT}" text-anchor="end">${escapeXml(
        formatBRL(service.price)
      )}</text>
</g>`;
    })
    .join("");

  const ctaY = Math.min(servicesStart + shown.length * 92 + 36, 920);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BG}" />
      <stop offset="100%" stop-color="${BG_MID}" />
    </linearGradient>
    <radialGradient id="glowTR" cx="0.9" cy="0.05" r="0.48">
      <stop offset="0%" stop-color="${EMERALD}" stop-opacity="0.2" />
      <stop offset="100%" stop-color="${EMERALD}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)" />
  <rect width="1080" height="1080" fill="url(#glowTR)" />
  <rect width="1080" height="6" fill="${EMERALD}" />
  ${agendaiWordmark(540, 78)}
  ${logoBlock}
  <text x="540" y="${shopY}" font-family="${FONT_FAMILY}" font-size="26" font-weight="700" fill="${EMERALD_LIGHT}" text-anchor="middle" letter-spacing="3">${shopName}</text>
  ${titleSvgs}
  <g>
    <rect x="100" y="${hoursY}" width="880" height="88" rx="20" fill="${SURFACE}" stroke="${BORDER}" stroke-width="1.5" />
    <text x="136" y="${hoursY + 34}" font-family="${FONT_FAMILY}" font-size="16" font-weight="700" fill="${EMERALD}" letter-spacing="3">${hoursKicker}</text>
    <text x="136" y="${hoursY + 68}" font-family="${FONT_FAMILY}" font-size="28" font-weight="700" fill="${TEXT_WHITE}">${escapeXml(
      scheduleLabel
    )}</text>
  </g>
  ${serviceCards}
  <g>
    <rect x="170" y="${ctaY}" width="740" height="88" rx="44" fill="${EMERALD}" />
    <text x="540" y="${ctaY + 56}" font-family="${FONT_FAMILY}" font-size="30" font-weight="800" fill="${EMERALD_FG}" text-anchor="middle">${ctaText}</text>
  </g>
  <text x="540" y="1044" font-family="${FONT_FAMILY}" font-size="18" font-weight="600" fill="${TEXT_MUTED}" text-anchor="middle">agendai.app  ·  fila digital e agenda</text>
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
