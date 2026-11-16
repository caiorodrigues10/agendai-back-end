-- ════════════════════════════════════════════════════════════════════════════
-- Anonymous site traffic counters + logged-user activity (platform scope).
--
-- Tables (additive and idempotent; no RLS — platform-level data like
-- `access_logs`, see docs/RLS-INVENTARIO.md):
--   site_traffic_daily       — civil day (America/Sao_Paulo) × area aggregates
--   site_traffic_hourly      — hour bucket inside a civil day × area
--   site_traffic_origin_daily— referrer host per civil day (HOST ONLY — the
--                              referrer path/query is never stored)
--   user_activity_daily      — distinct logged users per civil day
--
-- `lostUpdates` on site_traffic_daily counts detected Redis counter regressions
-- (e.g. Redis restarted and a counter came back to zero): consolidation keeps
-- GREATEST(persisted, redis) so the database never regresses, and records the
-- event here instead of silently undercounting.
--
-- Privacy: no IP, no user agent, no cookie, no route/path is persisted — only
-- daily HMAC visitor hashes live in Redis (TTL 24–48h) and are never written
-- to this database.
--
-- Backfill: intentionally executed after boot by the idempotent, monthly
-- `npm run traffic:backfill:user-activity` job. Keeping the data load out of
-- this DDL migration avoids a long transaction/lock over `access_logs` on
-- large installations. The job reads successful LOGIN / GOOGLE_LOGIN /
-- REFRESH events from the last six months; password LOGIN rows without
-- `userId` are joined by normalized email.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "site_traffic_daily" (
  "day" DATE NOT NULL,
  "area" VARCHAR(32) NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "visitors" INTEGER NOT NULL DEFAULT 0,
  "sessions" INTEGER NOT NULL DEFAULT 0,
  "lostUpdates" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "site_traffic_daily_pkey" PRIMARY KEY ("day", "area")
);

CREATE TABLE IF NOT EXISTS "site_traffic_hourly" (
  "day" DATE NOT NULL,
  "hour" INTEGER NOT NULL,
  "area" VARCHAR(32) NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "visitors" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "site_traffic_hourly_pkey" PRIMARY KEY ("day", "hour", "area")
);

CREATE TABLE IF NOT EXISTS "site_traffic_origin_daily" (
  "day" DATE NOT NULL,
  "origin" VARCHAR(255) NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "site_traffic_origin_daily_pkey" PRIMARY KEY ("day", "origin")
);

CREATE TABLE IF NOT EXISTS "user_activity_daily" (
  "day" DATE NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_activity_daily_pkey" PRIMARY KEY ("day", "userId")
);

-- ─── Grants: no PUBLIC access (platform tables, defense in depth) ───────────
-- The API connects with the migration/owner role; PUBLIC/anon/authenticated
-- must never touch these counters directly.
REVOKE ALL ON "site_traffic_daily", "site_traffic_hourly", "site_traffic_origin_daily", "user_activity_daily" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "site_traffic_daily", "site_traffic_hourly", "site_traffic_origin_daily", "user_activity_daily" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "site_traffic_daily", "site_traffic_hourly", "site_traffic_origin_daily", "user_activity_daily" FROM authenticated;
  END IF;
END $$;

-- ─── Grant internal:traffic:read to existing internal admins ────────────────
-- Additive and idempotent: only MASTER_ADMIN users that hold an explicit
-- permission list get the new permission. Holders of `internal:all` and
-- admins with an empty list already pass hasInternalPermission(), so nobody
-- loses access to the panel when the new screen lands.
UPDATE "users"
SET "permissions" = array_append("permissions", 'internal:traffic:read')
WHERE "role" = 'MASTER_ADMIN'
  AND "permissions" <> '{}'
  AND NOT ("permissions" @> ARRAY['internal:all'])
  AND NOT ('internal:traffic:read' = ANY("permissions"));
