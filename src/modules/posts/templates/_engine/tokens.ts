/**
 * Tokens de tema resolvidos em TS (literais, sem var() no satori).
 *
 * `accentInk` é calculado por luminância WCAG para garantir contraste AA (≥4,5:1)
 * do texto sobre a cor de destaque — nunca texto claro sobre accent claro.
 */

export type PostTokens = {
  bg: string;
  panel: string;
  accent: string;
  /** Texto sobre accent — calculado (preto/branco) por contraste. */
  accentInk: string;
  text: string;
  muted: string;
  fontHeading: string;
  fontBody: string;
};

/** Luminância relativa WCAG (0..1) de uma cor #rrggbb. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contraste WCAG (1..21) entre duas cores. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Escolhe preto/branco como tinta sobre `accent`, maximizando contraste (AA ≥4,5). */
export function accentInkFor(accent: string): string {
  const white = "#FFFFFF";
  const black = "#0A0A0A";
  return contrastRatio(accent, black) >= contrastRatio(accent, white) ? black : white;
}

export function resolveTokens(input: {
  bg: string;
  panel: string;
  accent: string;
  text: string;
  muted: string;
  fontHeading?: string;
  fontBody?: string;
}): PostTokens {
  return {
    bg: input.bg,
    panel: input.panel,
    accent: input.accent,
    accentInk: accentInkFor(input.accent),
    text: input.text,
    muted: input.muted,
    fontHeading: input.fontHeading ?? "Montserrat",
    fontBody: input.fontBody ?? "Inter",
  };
}

/** Paleta "dourado" de referência (barbearia) — ponto de partida do Modelo #1. */
export const DOURADO_TOKENS = resolveTokens({
  bg: "#171208",
  panel: "#171208",
  accent: "#F59E0B",
  text: "#FDF6E3",
  muted: "#B8AC93",
});
