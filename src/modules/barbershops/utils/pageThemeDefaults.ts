export const PAGE_THEME_DEFAULTS = {
  presetKey: null,
  accentColor: "#2CB58A",
  backgroundColor: "#0F1110",
  surfaceColor: "#1B1F1D",
  textColor: "#F2F5F3",
  textMutedColor: "#8B9990",
  radiusStyle: "rounded",
  buttonStyle: "filled",
  coverOverlay: 40,
} as const;

export const PAGE_THEME_COLOR_FIELDS = [
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textColor",
  "textMutedColor",
] as const;
