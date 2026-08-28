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

/** Paleta da landing / painel AgendAI (preto + emerald). */
const BG = "#0F0F0F";
const BG_MID = "#161616";
const SURFACE = "#212121";
const BORDER = "#303030";
const EMERALD = "#10B981";
const EMERALD_LIGHT = "#34D399";
const EMERALD_FG = "#052E1F";
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

/**
 * SVG 1080×1080 no visual do site: fundo #0f0f0f, accent emerald, CTA pílula.
 * Sem fontes externas nem emojis (resvg não busca na web).
 */
export function buildPostSvg(input: PostSvgInput): string {
  const shopName = escapeXml(truncate(input.shopName, 34).toUpperCase());
  const titleLines = wrapTitle(input.title).map(escapeXml);
  const ctaText = escapeXml(truncate(input.ctaText, 32));

  const scheduleLabel = input.todaySchedule?.isOpen
    ? `Hoje  ${input.todaySchedule.openTime} – ${input.todaySchedule.closeTime}`
    : "Consulte nossos horários";

  const hasLogo = Boolean(input.logoUrl?.startsWith("data:image"));
  const hoursKicker = input.todaySchedule?.isOpen ? "HOJE" : "HORÁRIOS";

  const logoBlock = hasLogo
    ? `<clipPath id="logoClip"><circle cx="540" cy="168" r="40" /></clipPath>
  <circle cx="540" cy="168" r="42" fill="none" stroke="${EMERALD}" stroke-width="3" />
  <image href="${escapeXml(input.logoUrl!)}" x="500" y="128" width="80" height="80" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : "";

  const titleY0 = hasLogo ? 292 : 248;
  const titleSvgs = titleLines
    .map(
      (line, i) =>
        `<text x="540" y="${titleY0 + i * 72}" font-family="${FONT_FAMILY}" font-size="58" font-weight="800" fill="${TEXT_WHITE}" text-anchor="middle">${line}</text>`
    )
    .join("");

  const hoursY = titleY0 + titleLines.length * 72 + 36;
  const servicesStart = hoursY + 140;
  const maxServices = hasLogo && titleLines.length > 1 ? 2 : 3;
  const shown = input.services.slice(0, maxServices);

  const serviceCards = shown
    .map((service, i) => {
      const y = servicesStart + i * 100;
      return `<g>
  <rect x="88" y="${y}" width="904" height="84" rx="20" fill="${SURFACE}" stroke="${BORDER}" stroke-width="2" />
  <rect x="88" y="${y}" width="8" height="84" rx="4" fill="${EMERALD}" />
  <text x="128" y="${y + 52}" font-family="${FONT_FAMILY}" font-size="28" font-weight="600" fill="${TEXT_WHITE}">${escapeXml(
        truncate(service.name, 26)
      )}</text>
  <text x="960" y="${y + 52}" font-family="${FONT_FAMILY}" font-size="30" font-weight="700" fill="${EMERALD_LIGHT}" text-anchor="end">${escapeXml(
        formatBRL(service.price)
      )}</text>
</g>`;
    })
    .join("");

  const ctaY = servicesStart + shown.length * 100 + 28;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BG}" />
      <stop offset="100%" stop-color="${BG_MID}" />
    </linearGradient>
    <radialGradient id="glowTR" cx="0.92" cy="0.04" r="0.5">
      <stop offset="0%" stop-color="${EMERALD}" stop-opacity="0.22" />
      <stop offset="100%" stop-color="${EMERALD}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowBL" cx="0.08" cy="0.92" r="0.45">
      <stop offset="0%" stop-color="#0D9488" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#0D9488" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)" />
  <rect width="1080" height="1080" fill="url(#glowTR)" />
  <rect width="1080" height="1080" fill="url(#glowBL)" />
  <rect width="1080" height="6" fill="${EMERALD}" />
  <g>
    <rect x="430" y="40" width="220" height="44" rx="22" fill="${EMERALD}" fill-opacity="0.14" stroke="${EMERALD}" stroke-width="1.5" />
    <text x="540" y="69" font-family="${FONT_FAMILY}" font-size="18" font-weight="800" fill="${EMERALD_LIGHT}" text-anchor="middle" letter-spacing="5">AGENDAI</text>
  </g>
  ${logoBlock}
  <text x="540" y="${hasLogo ? 236 : 154}" font-family="${FONT_FAMILY}" font-size="28" font-weight="700" fill="${EMERALD_LIGHT}" text-anchor="middle" letter-spacing="4">${shopName}</text>
  ${titleSvgs}
  <g>
    <rect x="88" y="${hoursY}" width="904" height="112" rx="24" fill="${SURFACE}" stroke="${BORDER}" stroke-width="2" />
    <text x="128" y="${hoursY + 42}" font-family="${FONT_FAMILY}" font-size="18" font-weight="700" fill="${EMERALD}" letter-spacing="4">${hoursKicker}</text>
    <text x="128" y="${hoursY + 86}" font-family="${FONT_FAMILY}" font-size="32" font-weight="700" fill="${TEXT_WHITE}">${escapeXml(
      scheduleLabel
    )}</text>
  </g>
  ${serviceCards}
  <g>
    <rect x="160" y="${ctaY}" width="760" height="92" rx="46" fill="${EMERALD}" />
    <text x="540" y="${ctaY + 58}" font-family="${FONT_FAMILY}" font-size="32" font-weight="800" fill="${EMERALD_FG}" text-anchor="middle">${ctaText}</text>
  </g>
  <text x="540" y="1048" font-family="${FONT_FAMILY}" font-size="20" font-weight="500" fill="${TEXT_MUTED}" text-anchor="middle">agendai.app  ·  fila digital e agenda</text>
</svg>`;
}

export function renderPostSvgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
  return resvg.render().asPng();
}

export function pngToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}
