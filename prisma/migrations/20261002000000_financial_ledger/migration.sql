-- ─── Financial ledger: mesma fonte de verdade para receita, comissão e caixa ───

-- 1) Appointment: persistir conclusão (valor, forma de pagamento, quem/quando)
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "finalPrice" DOUBLE PRECISION;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(50);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "completedBy" UUID;

CREATE INDEX IF NOT EXISTS "appointments_barbershopId_completedAt_idx"
  ON "appointments"("barbershopId", "completedAt");

-- 2) CommissionEntry: origem opcional fila/agenda
ALTER TABLE "commission_entries" ALTER COLUMN "queueItemId" DROP NOT NULL;
ALTER TABLE "commission_entries" ADD COLUMN IF NOT EXISTS "appointmentId" UUID;

ALTER TABLE "commission_entries"
  ADD CONSTRAINT "commission_entries_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "commission_entries_appointmentId_professionalId_key"
  ON "commission_entries"("appointmentId", "professionalId");

-- 3) FiadoPayment: forma de pagamento usada no recebimento
ALTER TABLE "fiado_payments" ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(50);

-- 4) ProfitEntry: despesas fora de overheadCategories como custo operacional
ALTER TABLE "profit_entries" ADD COLUMN IF NOT EXISTS "operationalCosts" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 5) CashMovement vira o livro financeiro (ledger)
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "professionalId" UUID;
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "clientId" UUID;
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "relatedSourceId" VARCHAR(100);

-- occurredAt começa igual ao createdAt dos lançamentos legados
UPDATE "cash_movements" SET "occurredAt" = "createdAt" WHERE "occurredAt" <> "createdAt";

ALTER TABLE "cash_movements" ALTER COLUMN "idempotencyKey" TYPE VARCHAR(160);

-- Unicidade (barbershopId, sourceType, sourceId, type): remove duplicatas legadas
-- mantendo o lançamento mais antigo de cada grupo antes de criar o índice.
DELETE FROM "cash_movements" cm
USING "cash_movements" keeper
WHERE cm."barbershopId" = keeper."barbershopId"
  AND cm."sourceType" = keeper."sourceType"
  AND cm."sourceId" = keeper."sourceId"
  AND cm."type" = keeper."type"
  AND (cm."createdAt" > keeper."createdAt"
    OR (cm."createdAt" = keeper."createdAt" AND cm.id > keeper.id));

CREATE UNIQUE INDEX IF NOT EXISTS "cash_movements_barbershopId_sourceType_sourceId_type_key"
  ON "cash_movements"("barbershopId", "sourceType", "sourceId", "type");

CREATE INDEX IF NOT EXISTS "cash_movements_barbershopId_occurredAt_idx"
  ON "cash_movements"("barbershopId", "occurredAt");

-- ─── Rollback (reversível) ───────────────────────────────────────────────────
-- DROP INDEX IF EXISTS "cash_movements_barbershopId_occurredAt_idx";
-- DROP INDEX IF EXISTS "cash_movements_barbershopId_sourceType_sourceId_type_key";
-- ALTER TABLE "cash_movements" ALTER COLUMN "idempotencyKey" TYPE VARCHAR(100);
-- ALTER TABLE "cash_movements" DROP COLUMN IF EXISTS "relatedSourceId";
-- ALTER TABLE "cash_movements" DROP COLUMN IF EXISTS "clientId";
-- ALTER TABLE "cash_movements" DROP COLUMN IF EXISTS "professionalId";
-- ALTER TABLE "cash_movements" DROP COLUMN IF EXISTS "occurredAt";
-- ALTER TABLE "profit_entries" DROP COLUMN IF EXISTS "operationalCosts";
-- ALTER TABLE "fiado_payments" DROP COLUMN IF EXISTS "paymentMethod";
-- DROP INDEX IF EXISTS "commission_entries_appointmentId_professionalId_key";
-- ALTER TABLE "commission_entries" DROP CONSTRAINT IF EXISTS "commission_entries_appointmentId_fkey";
-- ALTER TABLE "commission_entries" DROP COLUMN IF EXISTS "appointmentId";
-- ALTER TABLE "commission_entries" ALTER COLUMN "queueItemId" SET NOT NULL;
-- DROP INDEX IF EXISTS "appointments_barbershopId_completedAt_idx";
-- ALTER TABLE "appointments" DROP COLUMN IF EXISTS "completedBy";
-- ALTER TABLE "appointments" DROP COLUMN IF EXISTS "completedAt";
-- ALTER TABLE "appointments" DROP COLUMN IF EXISTS "paymentMethod";
-- ALTER TABLE "appointments" DROP COLUMN IF EXISTS "finalPrice";
