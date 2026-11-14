-- ════════════════════════════════════════════════════════════════════════════
-- Adicionais de serviço — catálogo + domínio (FASE 2).
--
-- Tabelas novas (legado `service_addons` intocado):
--   • salon_addons          — adicional do catálogo do salão
--   • service_addon_links   — vínculo N:N serviço ↔ adicional (+ overrides)
--   • appointment_addons    — linha/snapshot de adicional em agendamento
--
-- Decisões aprovadas (FASE 0):
--   • preços Decimal(12,2) em price / priceOverride / unitPrice
--   • sem productId / stockQtyPerUse (removidos do escopo)
--   • availableOnline default true; maxQuantity; commissionable; deletedAt; sortOrder
--   • barbershopId nas 3 tabelas
--
-- Migration idempotente: tabelas, índices, FKs, RLS e grants reaplicáveis.
-- Sem DEFAULT em id (uuid é gerado no cliente) nem em updatedAt (@updatedAt).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Tabelas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "salon_addons" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "availableOnline" BOOLEAN NOT NULL DEFAULT true,
  "maxQuantity" INTEGER NOT NULL DEFAULT 10,
  "commissionable" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "salon_addons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_addon_links" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "addonId" UUID NOT NULL,
  "priceOverride" DECIMAL(12,2),
  "timeOverride" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_addon_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "appointment_addons" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "addonId" UUID NOT NULL,
  "nameSnapshot" VARCHAR(100) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "durationMinutes" INTEGER NOT NULL DEFAULT 0,
  "commissionable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_addons_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "service_addon_links_serviceId_addonId_key"
  ON "service_addon_links"("serviceId", "addonId");
CREATE INDEX IF NOT EXISTS "salon_addons_barbershopId_active_deletedAt_idx"
  ON "salon_addons"("barbershopId", "active", "deletedAt");
CREATE INDEX IF NOT EXISTS "service_addon_links_barbershopId_idx"
  ON "service_addon_links"("barbershopId");
CREATE INDEX IF NOT EXISTS "appointment_addons_appointmentId_idx"
  ON "appointment_addons"("appointmentId");
CREATE INDEX IF NOT EXISTS "appointment_addons_barbershopId_idx"
  ON "appointment_addons"("barbershopId");

-- ─── Foreign keys ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salon_addons_barbershopId_fkey') THEN
    ALTER TABLE "salon_addons" ADD CONSTRAINT "salon_addons_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_addon_links_barbershopId_fkey') THEN
    ALTER TABLE "service_addon_links" ADD CONSTRAINT "service_addon_links_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_addon_links_serviceId_fkey') THEN
    ALTER TABLE "service_addon_links" ADD CONSTRAINT "service_addon_links_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_addon_links_addonId_fkey') THEN
    ALTER TABLE "service_addon_links" ADD CONSTRAINT "service_addon_links_addonId_fkey"
      FOREIGN KEY ("addonId") REFERENCES "salon_addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointment_addons_barbershopId_fkey') THEN
    ALTER TABLE "appointment_addons" ADD CONSTRAINT "appointment_addons_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointment_addons_appointmentId_fkey') THEN
    ALTER TABLE "appointment_addons" ADD CONSTRAINT "appointment_addons_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointment_addons_addonId_fkey') THEN
    ALTER TABLE "appointment_addons" ADD CONSTRAINT "appointment_addons_addonId_fkey"
      FOREIGN KEY ("addonId") REFERENCES "salon_addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── RLS (padrão tenant_isolation + NULLIF + FORCE) ──────────────────────────
-- `current_setting(..., true)` devolve NULL se o GUC nunca foi setado; comparar
-- com '' deixa NULL = '' unknown e o FORCE esconde as linhas do tenant.
-- NULLIF evita erro de cast `''::uuid` quando ambos os ramos do OR são avaliados.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['salon_addons','service_addon_links','appointment_addons'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT (EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation'
    )) THEN
      EXECUTE format(
        'CREATE POLICY "tenant_isolation" ON %I USING (COALESCE(current_setting(''app.current_barbershop_id'', true), '''') = '''' OR "barbershopId" = NULLIF(current_setting(''app.current_barbershop_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ─── Grants: acesso exclusivo via Fastify (papel restrito) ───────────────────
-- Remove grants diretos; a API conecta com o papel `agendai` (superuser/
-- BYPASSRLS em dev) e o isolamento real é o `where` da aplicação + RLS em
-- produção com papel não-bypass.
REVOKE ALL ON "salon_addons", "service_addon_links", "appointment_addons" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "salon_addons", "service_addon_links", "appointment_addons" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "salon_addons", "service_addon_links", "appointment_addons" FROM authenticated;
  END IF;
END $$;
