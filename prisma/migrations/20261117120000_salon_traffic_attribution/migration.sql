-- ════════════════════════════════════════════════════════════════════════════
-- Tráfego das páginas públicas de um salão (visitas por salão/organização).
--
-- Tables (additive and idempotent; no RLS — platform-level data like
-- `site_traffic_*`, see docs/RLS-INVENTARIO.md):
--   salon_traffic_daily        — civil day (America/Sao_Paulo) × target
--   salon_traffic_hourly       — hour bucket inside a civil day × target
--   salon_traffic_section_daily— seção da página pública × target
--   salon_traffic_origin_daily — referrer host por dia e target (HOST ONLY)
--
-- `target` é a chave de atribuição (nunca o slug/id público enviado pelo
-- navegador):
--   b:<barbershopId>  — visita atribuída ao salão (UUID enviado pelo front)
--   o:<organizationId>— visita atribuída à organização (slug do link público)
--
-- Privacy: nenhum IP, user agent, cookie ou hash de visitante é gravado aqui.
-- Só contagens agregadas; o hash diário de visitante vive no Redis (TTL 24h)
-- e nunca chega ao banco.
--
-- Retenção: agregados de 13 meses (limpeza no cron de consolidação do
-- tráfego — `consolidateTrafficDays`). As tabelas do beacon global
-- (`site_traffic_*`) mantêm a retenção preexistente, inalterada aqui.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "salon_traffic_daily" (
  "day" DATE NOT NULL,
  "target" VARCHAR(48) NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "visitors" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "salon_traffic_daily_pkey" PRIMARY KEY ("day", "target")
);

CREATE TABLE IF NOT EXISTS "salon_traffic_hourly" (
  "day" DATE NOT NULL,
  "hour" INTEGER NOT NULL,
  "target" VARCHAR(48) NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "visitors" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "salon_traffic_hourly_pkey" PRIMARY KEY ("day", "hour", "target")
);

CREATE TABLE IF NOT EXISTS "salon_traffic_section_daily" (
  "day" DATE NOT NULL,
  "target" VARCHAR(48) NOT NULL,
  "section" VARCHAR(16) NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "visitors" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "salon_traffic_section_daily_pkey" PRIMARY KEY ("day", "target", "section")
);

CREATE TABLE IF NOT EXISTS "salon_traffic_origin_daily" (
  "day" DATE NOT NULL,
  "target" VARCHAR(48) NOT NULL,
  "origin" VARCHAR(255) NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "salon_traffic_origin_daily_pkey" PRIMARY KEY ("day", "target", "origin")
);

-- ─── Grants: no PUBLIC access (platform tables, defense in depth) ───────────
-- The API connects with the migration/owner role; PUBLIC/anon/authenticated
-- must never touch these counters directly.
REVOKE ALL ON "salon_traffic_daily", "salon_traffic_hourly", "salon_traffic_section_daily", "salon_traffic_origin_daily" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "salon_traffic_daily", "salon_traffic_hourly", "salon_traffic_section_daily", "salon_traffic_origin_daily" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "salon_traffic_daily", "salon_traffic_hourly", "salon_traffic_section_daily", "salon_traffic_origin_daily" FROM authenticated;
  END IF;
END $$;
