-- ════════════════════════════════════════════════════════════════════════════
-- Exportação de planilhas (backend de exportação de dados)
--
-- Cria a tabela de pedidos de exportação:
--   • export_jobs — um pedido por emissão (período + módulos + formato);
--     o arquivo é gerado no worker e expira em 24h.
--
-- Migration idempotente: enums, tabela, índices, FKs e RLS podem ser
-- reaplicados sem erro.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExportJobStatus') THEN
    CREATE TYPE "ExportJobStatus" AS ENUM (
      'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExportJobFormat') THEN
    CREATE TYPE "ExportJobFormat" AS ENUM ('XLSX', 'CSV_ZIP');
  END IF;
END $$;

-- ─── Tabela ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "export_jobs" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "periodPreset" VARCHAR(32) NOT NULL,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "timezone" VARCHAR(64) NOT NULL,
  "modules" JSONB NOT NULL,
  "options" JSONB,
  "format" "ExportJobFormat" NOT NULL DEFAULT 'XLSX',
  "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
  "progress" JSONB,
  "fileSizeBytes" INTEGER,
  "filePath" VARCHAR(500),
  "fileName" VARCHAR(255),
  "errorMessage" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "export_jobs_barbershopId_createdAt_idx" ON "export_jobs"("barbershopId", "createdAt");
CREATE INDEX IF NOT EXISTS "export_jobs_barbershopId_status_idx" ON "export_jobs"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "export_jobs_status_expiresAt_idx" ON "export_jobs"("status", "expiresAt");

-- ─── Foreign keys ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'export_jobs_barbershopId_fkey') THEN
    ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'export_jobs_createdById_fkey') THEN
    ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Mesma variante usada em `import_batches`: o contexto de tenant é lido de
-- `app.current_barbershop_id`. Vazio = contexto ausente (conexões internas).
DO $$
BEGIN
  ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "export_jobs" FORCE ROW LEVEL SECURITY;
  IF NOT (EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'export_jobs' AND policyname = 'tenant_isolation'
  )) THEN
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON "export_jobs" USING (current_setting(''app.current_barbershop_id'', true) = '''' OR "barbershopId" = current_setting(''app.current_barbershop_id'', true)::uuid)'
    );
  END IF;
END $$;
