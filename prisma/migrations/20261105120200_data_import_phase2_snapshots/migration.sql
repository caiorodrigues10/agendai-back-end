-- ════════════════════════════════════════════════════════════════════════════
-- Fase 2 do assistente de importação — snapshot para desfazer
--
-- Quando a importação SUBSTITUI um registro que já existia (ex.: o horário do
-- dia de um profissional), o valor anterior fica salvo em previousState.
-- O desfazer restaura esse valor em vez de simplesmente apagar a linha.
--
-- Migration idempotente: pode ser reaplicada sem erro.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "import_created_entities" ADD COLUMN IF NOT EXISTS "previousState" JSONB;
