-- Tema da página pública: modo (AUTO|LIGHT|DARK) + variantes clara/escura.
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.

ALTER TABLE "barbershop_page_themes" ADD COLUMN IF NOT EXISTS "mode" VARCHAR(20) NOT NULL DEFAULT 'AUTO';
ALTER TABLE "barbershop_page_themes" ADD COLUMN IF NOT EXISTS "lightColors" JSONB;
ALTER TABLE "barbershop_page_themes" ADD COLUMN IF NOT EXISTS "darkColors" JSONB;

-- Migra as cores atuais (colunas planas) para darkColors sem perder nada.
UPDATE "barbershop_page_themes"
SET "darkColors" = jsonb_build_object(
    'accentColor', "accentColor",
    'backgroundColor', "backgroundColor",
    'surfaceColor', "surfaceColor",
    'textColor', "textColor",
    'textMutedColor', "textMutedColor"
)
WHERE "darkColors" IS NULL;
