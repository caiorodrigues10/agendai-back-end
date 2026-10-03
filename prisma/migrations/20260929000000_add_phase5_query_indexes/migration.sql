-- Fase 5 (consultas/índices): índices derivados de consultas reais, todos aditivos.
-- Reversão equivalente: DROP INDEX "queue_barbershopId_status_joinedAt_idx";
--                      DROP INDEX "expenses_barbershopId_referenceDate_idx";
--                      DROP INDEX "fiados_barbershopId_status_idx";
--                      DROP INDEX "appointments_date_idx";

-- Fila: listagem/métricas filtram por (barbershopId, status) e ordenam por joinedAt.
CREATE INDEX IF NOT EXISTS "queue_barbershopId_status_joinedAt_idx"
ON "queue"("barbershopId", "status", "joinedAt");

-- Despesas: listagem e resumo filtram barbershopId + faixa de referenceDate.
CREATE INDEX IF NOT EXISTS "expenses_barbershopId_referenceDate_idx"
ON "expenses"("barbershopId", "referenceDate");

-- Fiados: listagem/resumo filtram barbershopId + status.
CREATE INDEX IF NOT EXISTS "fiados_barbershopId_status_idx"
ON "fiados"("barbershopId", "status");

-- Agendamentos: o cron de lembretes varre por `date` globalmente (sem barbershopId).
CREATE INDEX IF NOT EXISTS "appointments_date_idx"
ON "appointments"("date");
