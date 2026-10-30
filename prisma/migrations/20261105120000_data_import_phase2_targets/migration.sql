-- ════════════════════════════════════════════════════════════════════════════
-- Fase 2 do assistente de importação de planilhas — novos alvos e entidades
--
-- Novos alvos (o que a aba da planilha importa):
--   STAFF_SCHEDULES  horário dos profissionais
--   SHOP_SCHEDULE    horário do estabelecimento
--   TIME_OFF         folgas e bloqueios
--   PRODUCTS         produtos e estoque inicial
--   SERVICE_PACKAGES catálogo de pacotes
--   CLIENT_PACKAGES  saldo de pacotes dos clientes
--   FIADOS           dívidas (fiado)
--
-- Novas entidades (o que o lote cria — usadas pelo desfazer):
--   STAFF_SCHEDULE, SHOP_SCHEDULE, TIME_OFF, PRODUCT, PRODUCT_CATEGORY,
--   SERVICE_PACKAGE, CLIENT_PACKAGE, FIADO
--
-- Uma planilha pode ter abas de tipos diferentes: a linha do resultado passa
-- a guardar a aba ("sheetName") e a chave única passa a ser
-- (batchId, sheetName, rowNumber).
--
-- Migration idempotente: pode ser reaplicada sem erro.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Alvos ───────────────────────────────────────────────────────────────────
ALTER TYPE "ImportTargetType" ADD VALUE IF NOT EXISTS 'STAFF_SCHEDULES';
ALTER TYPE "ImportTargetType" ADD VALUE IF NOT EXISTS 'SHOP_SCHEDULE';
ALTER TYPE "ImportTargetType" ADD VALUE IF NOT EXISTS 'TIME_OFF';
ALTER TYPE "ImportTargetType" ADD VALUE IF NOT EXISTS 'PRODUCTS';
ALTER TYPE "ImportTargetType" ADD VALUE IF NOT EXISTS 'SERVICE_PACKAGES';
ALTER TYPE "ImportTargetType" ADD VALUE IF NOT EXISTS 'CLIENT_PACKAGES';
ALTER TYPE "ImportTargetType" ADD VALUE IF NOT EXISTS 'FIADOS';

-- ─── Entidades ───────────────────────────────────────────────────────────────
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'STAFF_SCHEDULE';
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'SHOP_SCHEDULE';
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'TIME_OFF';
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'PRODUCT';
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'PRODUCT_CATEGORY';
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'SERVICE_PACKAGE';
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'CLIENT_PACKAGE';
ALTER TYPE "ImportEntityType" ADD VALUE IF NOT EXISTS 'FIADO';

-- ─── Linha por aba ───────────────────────────────────────────────────────────
ALTER TABLE "import_row_results" ADD COLUMN IF NOT EXISTS "sheetName" VARCHAR(120) NOT NULL DEFAULT 'CSV';

-- Lotes antigos (Fase 1): a aba era a única do arquivo — usa a aba do lote.
UPDATE "import_row_results" r
  SET "sheetName" = COALESCE(
    (SELECT b."sheetName" FROM "import_batches" b WHERE b.id = r."batchId"),
    'CSV'
  )
  WHERE r."sheetName" = 'CSV';

DROP INDEX IF EXISTS "import_row_results_batchId_rowNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "import_row_results_batchId_sheetName_rowNumber_key"
  ON "import_row_results"("batchId", "sheetName", "rowNumber");
