-- ════════════════════════════════════════════════════════════════════════════
-- Contadores de CRM da importação de planilhas
--
-- A importação atualiza o total de agendamentos e a última visita do cliente
-- importado — sem notificar ninguém e sem tocar em comissão/financeiro.
--
-- A coluna "crmCountersAppliedAt" marca que a contagem do lote já foi feita:
-- o worker pode ser reprocessado pela fila sem contar o mesmo agendamento
-- duas vezes.
--
-- Migration idempotente: pode ser reaplicada sem erro.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "salon_clients" ADD COLUMN IF NOT EXISTS "lastVisitAt" TIMESTAMP(3);

ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "crmCountersAppliedAt" TIMESTAMP(3);
