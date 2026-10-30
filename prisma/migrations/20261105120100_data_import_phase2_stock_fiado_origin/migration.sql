-- ════════════════════════════════════════════════════════════════════════════
-- Fase 2 do assistente de importação — movimento de estoque de importação
--
-- Saldo inicial de produto vem da planilha. Não é compra: por isso o tipo
-- IMPORT (não entra em InventoryReceipt, não gera despesa, não gera caixa).
--
-- Dívida (fiado) importada ganha a origem IMPORT: o primeiro ciclo de
-- cobrança não deve cobrar uma dívida que já existia antes da importação.
--
-- Migration idempotente: pode ser reaplicada sem erro.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'IMPORT';
ALTER TYPE "FiadoOrigin" ADD VALUE IF NOT EXISTS 'IMPORT';
