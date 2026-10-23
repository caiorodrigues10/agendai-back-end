-- Galeria pública do salão: tabela única (post_media) com flag inGallery.
-- Sem backfill: fotos existentes não entram na galeria sem escolha do dono.
ALTER TABLE "post_media" ADD COLUMN "inGallery" BOOLEAN NOT NULL DEFAULT false;

-- Listagem pública: WHERE barbershopId + inGallery ORDER BY createdAt DESC
CREATE INDEX "post_media_barbershopId_inGallery_createdAt_idx" ON "post_media"("barbershopId", "inGallery", "createdAt");
