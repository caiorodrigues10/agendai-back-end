-- ════════════════════════════════════════════════════════════════════════════
-- Importação de planilhas (backend de importação de dados)
--
-- Cria a base do assistente de importação:
--   • import_batches             — um lote por arquivo enviado
--   • import_row_results         — resultado por linha (chave batchId+rowNumber
--                                  garante idempotência do reprocessamento)
--   • import_created_entities    — vínculo lote ↔ entidades criadas (desfazer)
--
-- Migration idempotente: enums, tabelas, índices, FKs e RLS podem ser
-- reaplicados sem erro.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportFileFormat') THEN
    CREATE TYPE "ImportFileFormat" AS ENUM ('XLSX', 'CSV');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportTargetType') THEN
    CREATE TYPE "ImportTargetType" AS ENUM ('CLIENTS', 'SERVICES', 'APPOINTMENTS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportBatchStatus') THEN
    CREATE TYPE "ImportBatchStatus" AS ENUM (
      'UPLOADED', 'MAPPING', 'VALIDATING', 'AWAITING_CONFIRMATION',
      'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED',
      'CANCELLED', 'UNDONE', 'EXPIRED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportRowStatus') THEN
    CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'IMPORTED', 'SKIPPED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportEntityType') THEN
    CREATE TYPE "ImportEntityType" AS ENUM ('CLIENT', 'SERVICE', 'APPOINTMENT', 'CASE');
  END IF;
END $$;

-- Origem IMPORT: agendamento vindo de planilha. Agendamentos importados não
-- disparam lembrete, avaliação, NPS, comissão nem lançamento financeiro.
ALTER TYPE "AppointmentSource" ADD VALUE IF NOT EXISTS 'IMPORT';

-- ─── Tabelas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "filePath" VARCHAR(500) NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileFormat" "ImportFileFormat" NOT NULL,
  "sheetName" VARCHAR(120),
  "targetType" "ImportTargetType" NOT NULL DEFAULT 'CLIENTS',
  "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
  "headers" JSONB,
  "mapping" JSONB,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "undoneAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "import_row_results" (
  "id" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
  "entityType" "ImportEntityType",
  "entityId" UUID,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "import_row_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "import_created_entities" (
  "id" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "entityType" "ImportEntityType" NOT NULL,
  "entityId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt" TIMESTAMP(3),
  CONSTRAINT "import_created_entities_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "import_batches_barbershopId_createdAt_idx" ON "import_batches"("barbershopId", "createdAt");
CREATE INDEX IF NOT EXISTS "import_batches_barbershopId_status_idx" ON "import_batches"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "import_row_results_barbershopId_status_idx" ON "import_row_results"("barbershopId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "import_row_results_batchId_rowNumber_key" ON "import_row_results"("batchId", "rowNumber");
CREATE INDEX IF NOT EXISTS "import_created_entities_barbershopId_entityType_idx" ON "import_created_entities"("barbershopId", "entityType");
CREATE UNIQUE INDEX IF NOT EXISTS "import_created_entities_batchId_entityType_entityId_key" ON "import_created_entities"("batchId", "entityType", "entityId");

-- ─── Foreign keys ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_batches_barbershopId_fkey') THEN
    ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_batches_createdById_fkey') THEN
    ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_row_results_batchId_fkey') THEN
    ALTER TABLE "import_row_results" ADD CONSTRAINT "import_row_results_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_created_entities_batchId_fkey') THEN
    ALTER TABLE "import_created_entities" ADD CONSTRAINT "import_created_entities_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Mesma variante usada em `client_cases`: o contexto de tenant é lido de
-- `app.current_barbershop_id`. Vazio = contexto ausente (conexões internas).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_batches', 'import_row_results', 'import_created_entities'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT (EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation'
    )) THEN
      EXECUTE format(
        'CREATE POLICY "tenant_isolation" ON %I USING (current_setting(''app.current_barbershop_id'', true) = '''' OR "barbershopId" = current_setting(''app.current_barbershop_id'', true)::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
