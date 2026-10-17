export interface PageThemeColorsInput {
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
}

export interface ContrastCheck {
  key: string;
  leftLabel: string;
  rightLabel: string;
  leftColor: string;
  rightColor: string;
  ratio: number;
  minRatio: number;
  ok: boolean;
  suggestion?: { field: keyof PageThemeColorsInput; value: string };
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export const PAGE_THEME_LIGHT_FALLBACK = "#FFFFFF";
export const PAGE_THEME_DARK_FALLBACK = "#0B0F0E";

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

export function normalizeHexColor(value: string): string {
  return value.trim().toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function deriveButtonFg(accentColor: string): string {
  return contrastRatio(PAGE_THEME_LIGHT_FALLBACK, accentColor) >=
    contrastRatio(PAGE_THEME_DARK_FALLBACK, accentColor)
    ? PAGE_THEME_LIGHT_FALLBACK
    : PAGE_THEME_DARK_FALLBACK;
}

function bestTextColor(field: keyof PageThemeColorsInput, against: string): string {
  return contrastRatio(PAGE_THEME_LIGHT_FALLBACK, against) >=
    contrastRatio(PAGE_THEME_DARK_FALLBACK, against)
    ? PAGE_THEME_LIGHT_FALLBACK
    : PAGE_THEME_DARK_FALLBACK;
}

function mixToward(hex: string, target: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(target);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return (
    "#" +
    [mix(r1, r2), mix(g1, g2), mix(b1, b2)]
      .map(v => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function evaluatePair(params: {
  key: string;
  leftLabel: string;
  rightLabel: string;
  leftColor: string;
  rightColor: string;
  minRatio: number;
  suggestion?: ContrastCheck["suggestion"];
}): ContrastCheck {
  const ratio = contrastRatio(params.leftColor, params.rightColor);
  const ok = ratio >= params.minRatio;
  return {
    key: params.key,
    leftLabel: params.leftLabel,
    rightLabel: params.rightLabel,
    leftColor: params.leftColor,
    rightColor: params.rightColor,
    ratio: Math.round(ratio * 100) / 100,
    minRatio: params.minRatio,
    ok,
    suggestion: ok ? undefined : params.suggestion,
  };
}

/**
 * Valida contraste WCAG AA do tema da página pública.
 * Pares: texto×fundo, texto×superfície, texto secundário nos dois,
 * botão×accent e accent×superfície/fundo (componentes de UI ≥3:1).
 */
export function evaluateThemeContrast(colors: PageThemeColorsInput): ContrastCheck[] {
  const checks: ContrastCheck[] = [
    evaluatePair({
      key: "text-background",
      leftLabel: "Texto",
      rightLabel: "Fundo",
      leftColor: colors.textColor,
      rightColor: colors.backgroundColor,
      minRatio: 4.5,
      suggestion: { field: "textColor", value: bestTextColor("textColor", colors.backgroundColor) },
    }),
    evaluatePair({
      key: "text-surface",
      leftLabel: "Texto",
      rightLabel: "Cartões",
      leftColor: colors.textColor,
      rightColor: colors.surfaceColor,
      minRatio: 4.5,
      suggestion: { field: "textColor", value: bestTextColor("textColor", colors.surfaceColor) },
    }),
    evaluatePair({
      key: "muted-background",
      leftLabel: "Texto secundário",
      rightLabel: "Fundo",
      leftColor: colors.textMutedColor,
      rightColor: colors.backgroundColor,
      minRatio: 4.5,
      suggestion: {
        field: "textMutedColor",
        value: bestTextColor("textMutedColor", colors.backgroundColor),
      },
    }),
    evaluatePair({
      key: "muted-surface",
      leftLabel: "Texto secundário",
      rightLabel: "Cartões",
      leftColor: colors.textMutedColor,
      rightColor: colors.surfaceColor,
      minRatio: 4.5,
      suggestion: {
        field: "textMutedColor",
        value: bestTextColor("textMutedColor", colors.surfaceColor),
      },
    }),
  ];

  const buttonFg = deriveButtonFg(colors.accentColor);
  checks.push(
    evaluatePair({
      key: "button-accent",
      leftLabel: "Texto do botão",
      rightLabel: "Cor de destaque",
      leftColor: buttonFg,
      rightColor: colors.accentColor,
      minRatio: 4.5,
    }),
  );

  for (const [key, label, target] of [
    ["accent-surface", "Cor de destaque", colors.surfaceColor],
    ["accent-background", "Cor de destaque", colors.backgroundColor],
  ] as const) {
    const ratio = contrastRatio(colors.accentColor, target);
    const ok = ratio >= 3;
    let suggestion: ContrastCheck["suggestion"];
    if (!ok) {
      const toward = contrastRatio("#FFFFFF", target) >= contrastRatio("#000000", target) ? "#000000" : "#FFFFFF";
      let suggested = colors.accentColor;
      for (const step of [0.15, 0.3, 0.45, 0.6, 0.75]) {
        const candidate = mixToward(colors.accentColor, toward, step);
        if (contrastRatio(candidate, target) >= 3) {
          suggested = candidate;
          break;
        }
        suggested = candidate;
      }
      suggestion = { field: "accentColor", value: suggested };
    }
    checks.push(
      evaluatePair({
        key,
        leftLabel: label,
        rightLabel: key === "accent-surface" ? "Cartões" : "Fundo",
        leftColor: colors.accentColor,
        rightColor: target,
        minRatio: 3,
        suggestion,
      }),
    );
  }

  return checks;
}

export function failingContrastChecks(checks: ContrastCheck[]): ContrastCheck[] {
  return checks.filter(check => !check.ok);
}
