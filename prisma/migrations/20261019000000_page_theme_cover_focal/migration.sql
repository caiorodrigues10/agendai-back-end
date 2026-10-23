-- Capa aceita qualquer medida: ponto focal do recorte 16:9 + dimensões
-- originais (para o front recortar sem ampliar).
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.

ALTER TABLE "barbershop_page_themes" ADD COLUMN IF NOT EXISTS "coverFocalX" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "barbershop_page_themes" ADD COLUMN IF NOT EXISTS "coverFocalY" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "barbershop_page_themes" ADD COLUMN IF NOT EXISTS "coverWidth" INTEGER;
ALTER TABLE "barbershop_page_themes" ADD COLUMN IF NOT EXISTS "coverHeight" INTEGER;
