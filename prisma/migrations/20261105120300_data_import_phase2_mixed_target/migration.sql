-- ════════════════════════════════════════════════════════════════════════════
-- Fase 2 do assistente de importação — alvo "MIXED"
--
-- Uma planilha pode ter abas de tipos diferentes (clientes, serviços,
-- produtos, horários...). O lote passa a guardar o valor "MIXED" quando as
-- abas do plano não são todas do mesmo tipo; o detalhe de cada aba vive no
-- plano (JSON do mapeamento).
--
-- Migration idempotente: pode ser reaplicada sem erro.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TYPE "ImportTargetType" ADD VALUE IF NOT EXISTS 'MIXED';
