-- Adiciona a origem do lote de importação (WEB ou WHATSAPP_OWNER_BOT).
ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(20) NOT NULL DEFAULT 'WEB';

CREATE INDEX IF NOT EXISTS "import_batches_barbershopId_source_idx" ON "import_batches" ("barbershopId", "source");
