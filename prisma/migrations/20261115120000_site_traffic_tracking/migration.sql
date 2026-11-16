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
-- Backfill: user_activity_daily is seeded from access_logs (6-month retention)
-- for successful LOGIN / GOOGLE_LOGIN / REFRESH events. Password LOGIN rows
-- historically have email but no userId, so they are joined by normalized
-- email; rows that cannot be mapped to a user are intentionally ignored.
-- `deletedAt` is irrelevant here: activity is counted by event day, regardless
-- of later account removal.
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

-- ─── Backfill: logged-user activity from access_logs (up to 6 months) ───────
-- `createdAt` is stored in UTC without timezone; convert UTC → São Paulo
-- before taking the civil date. ON CONFLICT keeps the migration re-runnable.
INSERT INTO "user_activity_daily" ("day", "userId")
SELECT DISTINCT
  (((al."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date),
  u."id"
FROM "access_logs" al
JOIN "users" u
  ON (
    al."userId" IS NOT NULL
    AND u."id" = al."userId"
  )
  OR (
    al."userId" IS NULL
    AND al."action" = 'LOGIN'
    AND lower(u."email") = lower(al."email")
  )
WHERE al."success" = true
  AND al."action" IN ('LOGIN', 'GOOGLE_LOGIN', 'REFRESH')
  AND al."createdAt" >= NOW() - INTERVAL '6 months'
ON CONFLICT ("day", "userId") DO NOTHING;

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
