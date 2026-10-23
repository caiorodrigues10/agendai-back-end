import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve estar no formato #RRGGBB");

export const pageThemeIdParamsSchema = z.object({
  id: z.string().uuid("id do salão inválido"),
});

const pageThemeVariantColors = z.object({
  accentColor: hexColor,
  backgroundColor: hexColor,
  surfaceColor: hexColor,
  textColor: hexColor,
  textMutedColor: hexColor,
});

export const updatePageThemeBodySchema = z.object({
  presetKey: z.string().max(40).nullable().optional(),
  accentColor: hexColor,
  backgroundColor: hexColor,
  surfaceColor: hexColor,
  textColor: hexColor,
  textMutedColor: hexColor,
  /// AUTO (segue o sistema) | LIGHT | DARK. Ausente = legado = AUTO.
  mode: z.enum(["AUTO", "LIGHT", "DARK"], {
    errorMap: () => ({ message: "mode inválido. Aceitos: AUTO, LIGHT, DARK" }),
  }).optional(),
  /// Variante escura. Ausente = usa as cores planas acima (formato legado).
  darkColors: pageThemeVariantColors.optional(),
  /// Variante clara. null/ausente = ainda não materializada (gerada no front).
  lightColors: pageThemeVariantColors.nullable().optional(),
  radiusStyle: z.enum(["squared", "rounded", "pill"], {
    errorMap: () => ({ message: "radiusStyle inválido. Aceitos: squared, rounded, pill" }),
  }),
  buttonStyle: z.enum(["filled", "outline"], {
    errorMap: () => ({ message: "buttonStyle inválido. Aceitos: filled, outline" }),
  }),
  coverOverlay: z
    .number()
    .int("coverOverlay deve ser um inteiro")
    .min(0, "coverOverlay mínimo: 0")
    .max(80, "coverOverlay máximo: 80"),
  coverUrl: z.string().url("coverUrl deve ser uma URL válida").max(500).nullable().optional(),
  coverPublicId: z.string().max(300).nullable().optional(),
  /// Ponto focal do recorte 16:9 (0–100). Ausente = mantém o atual (50/50).
  coverFocalX: z
    .number()
    .int("coverFocalX deve ser um inteiro")
    .min(0, "coverFocalX mínimo: 0")
    .max(100, "coverFocalX máximo: 100")
    .optional(),
  coverFocalY: z
    .number()
    .int("coverFocalY deve ser um inteiro")
    .min(0, "coverFocalY mínimo: 0")
    .max(100, "coverFocalY máximo: 100")
    .optional(),
});

export type UpdatePageThemeBody = z.infer<typeof updatePageThemeBodySchema>;
