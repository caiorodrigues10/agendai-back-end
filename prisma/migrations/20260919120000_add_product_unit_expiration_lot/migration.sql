-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('UNIT', 'ML', 'L', 'G', 'KG', 'BOX', 'PACK', 'OTHER');

-- AlterTable: add unit, expirationDate, lotNumber
ALTER TABLE "products"
  ADD COLUMN "unit" "StockUnit" NOT NULL DEFAULT 'UNIT',
  ADD COLUMN "expirationDate" DATE,
  ADD COLUMN "lotNumber" VARCHAR(60);

-- CreateIndex
CREATE INDEX "products_barbershopId_expirationDate_idx" ON "products"("barbershopId", "expirationDate");

-- Backfill: map existing unitLabel values to StockUnit enum
-- IMPORTANT: Keep in sync with unitFromLabel() in
-- src/modules/products/utils/productStockUnit.ts (same mapping logic).
UPDATE "products" SET "unit" = 'UNIT'   WHERE lower(trim("unitLabel")) IN ('', 'un', 'und', 'unid', 'unidade', 'unidades');
UPDATE "products" SET "unit" = 'ML'     WHERE lower(trim("unitLabel")) IN ('ml');
UPDATE "products" SET "unit" = 'L'      WHERE lower(trim("unitLabel")) IN ('l', 'lt', 'litro', 'litros');
UPDATE "products" SET "unit" = 'G'      WHERE lower(trim("unitLabel")) IN ('g', 'gr', 'grama', 'gramas');
UPDATE "products" SET "unit" = 'KG'     WHERE lower(trim("unitLabel")) IN ('kg', 'quilo', 'quilos');
UPDATE "products" SET "unit" = 'BOX'    WHERE lower(trim("unitLabel")) IN ('cx', 'caixa', 'caixas');
UPDATE "products" SET "unit" = 'PACK'   WHERE lower(trim("unitLabel")) IN ('pct', 'pacote', 'pacotes');
UPDATE "products" SET "unit" = 'OTHER'  WHERE lower(trim("unitLabel")) NOT IN ('', 'un', 'und', 'unid', 'unidade', 'unidades', 'ml', 'l', 'lt', 'litro', 'litros', 'g', 'gr', 'grama', 'gramas', 'kg', 'quilo', 'quilos', 'cx', 'caixa', 'caixas', 'pct', 'pacote', 'pacotes') AND "unitLabel" IS NOT NULL AND trim("unitLabel") != '';
