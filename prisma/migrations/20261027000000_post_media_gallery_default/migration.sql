-- Toda foto enviada entra na galeria pública do perfil (aba "Fotos"):
-- a coluna passa a ter default true e o upload grava inGallery=true sempre.
ALTER TABLE "post_media" ALTER COLUMN "inGallery" SET DEFAULT true;

-- Backfill das fotos que ainda não estavam na galeria:
-- promove as MAIS RECENTES de cada salão até completar o limite de 30 fotos
-- e nunca rebaixa foto já publicada (dono escolheu com a estrela), nem
-- ultrapassa o limite — salões que já têm 30 fotos na galeria não mudam.
WITH counts AS (
  SELECT "barbershopId", COUNT(*) FILTER (WHERE "inGallery") AS gallery_count
  FROM "post_media"
  GROUP BY "barbershopId"
),
ranked AS (
  SELECT
    "id",
    "barbershopId",
    ROW_NUMBER() OVER (PARTITION BY "barbershopId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
  FROM "post_media"
  WHERE "inGallery" = false
)
UPDATE "post_media" AS m
SET "inGallery" = true
FROM ranked AS r
JOIN counts AS c ON c."barbershopId" = r."barbershopId"
WHERE m."id" = r."id"
  AND r.rn <= GREATEST(30 - c.gallery_count, 0);
