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

const FONT_FAMILY = "system-ui, 'Segoe UI', sans-serif";

const GOLD = "#F59E0B";
const DARK_BG_FROM = "#0B0F19";
const DARK_BG_TO = "#111827";
const CARD_BG = "#151C2E";
const CARD_BORDER = "#1F2937";
const TEXT_WHITE = "#F9FAFB";
const TEXT_MUTED = "#9CA3AF";

/** Escapa caracteres reservados do XML antes de interpolar valores no SVG. */
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

/**
 * Monta um SVG 1080x1080 com visual dark elegante (gradiente escuro + dourado).
 * NÃO usa fontes externas nem emojis: o resvg não busca recursos na web.
 */
export function buildPostSvg(input: PostSvgInput): string {
  const shopName = escapeXml(truncate(input.shopName, 34).toUpperCase());
  const title = escapeXml(truncate(input.title, 40));
  const ctaText = escapeXml(truncate(input.ctaText, 32));

  const scheduleLabel = input.todaySchedule?.isOpen
    ? `Hoje: ${input.todaySchedule.openTime} – ${input.todaySchedule.closeTime}`
    : "Consulte nossos horários";

  const logoBlock = input.logoUrl?.startsWith("data:image")
    ? `<clipPath id="logoClip"><circle cx="540" cy="150" r="38" /></clipPath>
  <image href="${escapeXml(input.logoUrl)}" x="502" y="112" width="76" height="76" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : "";

  const serviceCards = input.services
    .slice(0, 3)
    .map((service, i) => {
      const y = 560 + i * 110;
      return `<g>
  <rect x="100" y="${y}" width="880" height="92" rx="24" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2" />
  <text x="130" y="${y + 57}" font-family="${FONT_FAMILY}" font-size="30" font-weight="600" fill="${TEXT_WHITE}">${escapeXml(
        truncate(service.name, 26)
      )}</text>
  <text x="950" y="${y + 57}" font-family="${FONT_FAMILY}" font-size="32" font-weight="700" fill="${GOLD}" text-anchor="end">${escapeXml(
        formatBRL(service.price)
      )}</text>
</g>`;
    })
    .join("");

  const ctaY = 560 + input.services.slice(0, 3).length * 110 + 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${DARK_BG_FROM}" />
      <stop offset="100%" stop-color="${DARK_BG_TO}" />
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.06" r="0.55">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.16" />
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)" />
  <rect width="1080" height="1080" fill="url(#glow)" />
  <g>
    <rect x="444" y="52" width="192" height="44" rx="22" fill="${GOLD}" fill-opacity="0.12" stroke="${GOLD}" stroke-width="1.5" />
    <text x="540" y="80" font-family="${FONT_FAMILY}" font-size="20" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="6">AGENDAI</text>
  </g>
  ${logoBlock}
  <text x="540" y="240" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="3">${shopName}</text>
  <text x="540" y="330" font-family="${FONT_FAMILY}" font-size="62" font-weight="800" fill="${TEXT_WHITE}" text-anchor="middle">${title}</text>
  <g>
    <rect x="100" y="396" width="880" height="120" rx="28" fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="2" />
    <text x="130" y="438" font-family="${FONT_FAMILY}" font-size="22" font-weight="600" fill="${TEXT_MUTED}" letter-spacing="3">HOJE</text>
    <text x="130" y="490" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="${TEXT_WHITE}">${escapeXml(
      scheduleLabel
    )}</text>
  </g>
  ${serviceCards}
  <g>
    <rect x="190" y="${ctaY}" width="700" height="88" rx="44" fill="${GOLD}" />
    <text x="540" y="${ctaY + 55}" font-family="${FONT_FAMILY}" font-size="34" font-weight="800" fill="${DARK_BG_FROM}" text-anchor="middle">${ctaText}</text>
  </g>
  <text x="540" y="1052" font-family="${FONT_FAMILY}" font-size="22" font-weight="500" fill="${TEXT_MUTED}" text-anchor="middle">agendai.app · Fila digital e agenda</text>
</svg>`;
}

/** Renderiza o SVG para PNG 1080px de largura (mantém proporção). */
export function renderPostSvgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
  return resvg.render().asPng();
}

/** Converte o PNG em data-URL (base64) pronto para persistir em `FeedPost.imageUrl`. */
export function pngToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}