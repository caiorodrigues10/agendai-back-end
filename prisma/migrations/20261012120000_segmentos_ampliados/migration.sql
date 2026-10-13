-- Ampliação de segmentos de negócio e campo "businessSegmentOther".
--
-- Adiciona 13 valores ao enum BusinessSegment (maquiagem, saúde, pet
-- veterinário, automotivo, serviços gerais) e a coluna opcional
-- businessSegmentOther, que guarda o texto livre do usuário quando o
-- segmento escolhido é OTHER.
--
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.
-- Os novos valores são aditivos — dados existentes não são afetados.

-- AlterEnum (BusinessSegment)
DO $$
DECLARE
  v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'MAKEUP_STUDIO',
    'PHYSIOTHERAPY',
    'NUTRITION',
    'PSYCHOTHERAPY',
    'VETERINARY',
    'CAR_WASH',
    'AUTO_REPAIR',
    'PHOTO_STUDIO',
    'TATTOO_PIERCING',
    'COACHING',
    'PRIVATE_CLASSES',
    'TECH_SUPPORT',
    'HOME_SERVICES'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'BusinessSegment'
         AND e.enumlabel = v
    ) THEN
      EXECUTE format('ALTER TYPE "BusinessSegment" ADD VALUE %L', v);
    END IF;
  END LOOP;
END $$;

-- AlterTable: coluna opcional para o texto livre de OTHER
ALTER TABLE "barbershops" ADD COLUMN IF NOT EXISTS "businessSegmentOther" VARCHAR(80);
