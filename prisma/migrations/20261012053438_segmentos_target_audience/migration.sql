-- Segmentos de negócio e público atendido.
--
-- O enum BusinessSegment e o campo Barbershop.businessSegment já existiam
-- (default OTHER). Esta migration:
--   1. adiciona PETSHOP ao enum;
--   2. cria o enum TargetAudience e a coluna opcional targetAudience;
--   3. muda o default de OTHER para BARBERSHOP;
--   4. faz backfill dos salões que nunca escolheram segmento (estavam OTHER,
--      que era o default — nada setava o campo no create).
--
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'TargetAudience'
  ) THEN
    CREATE TYPE "TargetAudience" AS ENUM ('MASCULINO', 'FEMININO', 'UNISSEX');
  END IF;
END $$;

-- AlterEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'BusinessSegment'
       AND e.enumlabel = 'PETSHOP'
  ) THEN
    ALTER TYPE "BusinessSegment" ADD VALUE 'PETSHOP';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "barbershops" ADD COLUMN IF NOT EXISTS "targetAudience" "TargetAudience";
ALTER TABLE "barbershops" ALTER COLUMN "businessSegment" SET DEFAULT 'BARBERSHOP';

-- Backfill: OTHER era o default antigo e nada o preenchia no create, então
-- representa "nunca escolhido". Vira BARBERSHOP, que é o default novo e o
-- segmento real da maioria. Quem escolheu outro valor explicitamente na tela
-- de configurações (AESTHETICS, SPA, LASH_BROW_STUDIO, ...) é preservado.
--
-- Efeito colateral conhecido e aceito: o passo SEGMENT do onboarding marca
-- como concluído quando businessSegment !== 'OTHER' (GetOnboardingUseCase),
-- então os salões backflood deixam de ver esse passo.
UPDATE "barbershops"
   SET "businessSegment" = 'BARBERSHOP'
 WHERE "businessSegment" = 'OTHER';
