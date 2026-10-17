import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve estar no formato #RRGGBB");

export const pageThemeIdParamsSchema = z.object({
  id: z.string().uuid("id do salão inválido"),
});

export const updatePageThemeBodySchema = z.object({
  presetKey: z.string().max(40).nullable().optional(),
  accentColor: hexColor,
  backgroundColor: hexColor,
  surfaceColor: hexColor,
  textColor: hexColor,
  textMutedColor: hexColor,
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
});

export type UpdatePageThemeBody = z.infer<typeof updatePageThemeBodySchema>;
