-- Redes sociais do dono no perfil público: mapa rede → URL canônica.
-- Sem backfill: NULL = nenhuma rede cadastrada (nada aparece no perfil).
ALTER TABLE "barbershops" ADD COLUMN "socialLinks" JSONB;
