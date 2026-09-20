/**
 * Paletas visuais dos posts — famílias de cores completas e testadas.
 *
 * Regras:
 * - `brand` é a família padrão (compatível com posts antigos).
 * - Paleta define TODAS as cores da arte; o template define apenas a composição.
 * - Não expor seletor irrestrito de cores — apenas estas famílias.
 */

export interface PostPalette {
  key: string;
  label: string;
  /** Cor de destaque (barra superior, selos, CTA, preços). */
  accent: string;
  /** Cor do texto sobre `accent` (ex.: texto do botão CTA). */
  accentForeground: string;
  /** Fundo da arte. */
  background: string;
  /** Cartões internos sobre o fundo. */
  surface: string;
  /** Bordas sutis. */
  border: string;
  /** Texto principal. */
  foreground: string;
  /** Texto secundário. */
  muted: string;
  /** Arte clara (true) ajusta sombras/brilhos. */
  isLight: boolean;
}

export const POST_PALETTES: PostPalette[] = [
  {
    key: "brand",
    label: "Marca AgendAI",
    accent: "#10B981",
    accentForeground: "#052E1F",
    background: "#0F0F0F",
    surface: "#212121",
    border: "#303030",
    foreground: "#F1F1F1",
    muted: "#AAAAAA",
    isLight: false,
  },
  {
    key: "dourado",
    label: "Dourado",
    accent: "#F59E0B",
    accentForeground: "#1C1205",
    background: "#171208",
    surface: "#26200F",
    border: "#3D3320",
    foreground: "#FDF6E3",
    muted: "#B8AC93",
    isLight: false,
  },
  {
    key: "oceano",
    label: "Oceano",
    accent: "#38BDF8",
    accentForeground: "#052233",
    background: "#081520",
    surface: "#122330",
    border: "#1F3A4D",
    foreground: "#F0F9FF",
    muted: "#8FB5C9",
    isLight: false,
  },
  {
    key: "rose",
    label: "Rosé",
    accent: "#FB7185",
    accentForeground: "#2B0A12",
    background: "#180D12",
    surface: "#271622",
    border: "#40262F",
    foreground: "#FFF1F3",
    muted: "#C9A0AC",
    isLight: false,
  },
  {
    key: "floresta",
    label: "Floresta",
    accent: "#34D399",
    accentForeground: "#041F15",
    background: "#07170F",
    surface: "#0F2A1C",
    border: "#1E4430",
    foreground: "#EAFBF3",
    muted: "#8FBEA6",
    isLight: false,
  },
  {
    key: "clara",
    label: "Clara",
    accent: "#1C7E61",
    accentForeground: "#FFFFFF",
    background: "#FAFAF9",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    foreground: "#1C1917",
    muted: "#78716C",
    isLight: true,
  },
];

const PALETTE_BY_KEY = new Map(POST_PALETTES.map((p) => [p.key, p]));

export const DEFAULT_PALETTE_KEY = "brand";

const DEFAULT_PALETTE = PALETTE_BY_KEY.get(DEFAULT_PALETTE_KEY)!;

export function getPostPalette(key?: string | null): PostPalette {
  if (!key) return DEFAULT_PALETTE;
  return PALETTE_BY_KEY.get(key) ?? DEFAULT_PALETTE;
}

export function isValidPaletteKey(key: string): boolean {
  return PALETTE_BY_KEY.has(key);
}

export function listPostPalettes() {
  return POST_PALETTES.map(({ key, label }) => ({ key, label }));
}
