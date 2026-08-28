-- Fix schema drift between migrations directory and schema.prisma
-- Generated manually via `prisma migrate diff` on 2026-08-28
-- This migration corrects deviations created by direct SQL operations
-- (docker exec psql) that were never tracked by Prisma migrations.
--
-- Uses conditional SQL (DO blocks) to handle two scenarios:
--   - Real DB: has drift (password_reset_otps, users.phone, missing videoUrl)
--   - Fresh DB: baseline already applied correctly (no drift to fix)
--
-- IMPORTANT: This migration is idempotent — safe to run on any database state.

-- 1. Corrigir tipos em password_reset_tokens (TEXT → VARCHAR conforme schema.prisma)
--    The baseline migration 20260826160000 creates with TEXT types.
--    Real DB may have correct types from manual surgery — check before altering.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'password_reset_tokens'
    AND column_name = 'id'
    AND data_type = 'text'
  ) THEN
    -- Drop and recreate id column (TEXT → UUID) since we can't ALTER TYPE text→uuid
    DROP INDEX IF EXISTS "password_reset_tokens_email_idx";
    ALTER TABLE "password_reset_tokens"
      DROP CONSTRAINT "password_reset_tokens_pkey",
      DROP COLUMN "id",
      ADD COLUMN "id" UUID NOT NULL,
      ALTER COLUMN "email" SET DATA TYPE VARCHAR(100),
      ALTER COLUMN "email" DROP DEFAULT,
      ALTER COLUMN "token" SET DATA TYPE VARCHAR(64),
      ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id");
    CREATE INDEX "password_reset_tokens_email_idx" ON "password_reset_tokens"("email");
  END IF;
END $$;

-- 2. Adicionar coluna videoUrl em feed_posts (presente no schema.prisma)
--    Baseline already creates it on fresh DBs, but real DB may be missing it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feed_posts'
    AND column_name = 'videoUrl'
  ) THEN
    ALTER TABLE "feed_posts" ADD COLUMN "videoUrl" TEXT;
  END IF;
END $$;

-- 3. Remover tabela password_reset_otps (existente no banco mas removida do schema.prisma)
--    Does NOT exist on fresh DBs — only on drifted real DBs.
DROP TABLE IF EXISTS "password_reset_otps";

-- 4. Remover coluna phone de users (existente no banco mas removida do schema.prisma)
--    Does NOT exist on fresh DBs — only on drifted real DBs.
ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";
