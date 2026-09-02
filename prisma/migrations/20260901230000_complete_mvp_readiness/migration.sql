-- Completa as estruturas adicionadas pelo MVP public readiness.
-- Esta migration e aditiva para funcionar mesmo quando a migration anterior
-- ja tiver sido aplicada em staging ou producao.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'PENDING'
  ) THEN
    ALTER TYPE "SubscriptionStatus" ADD VALUE 'PENDING';
  END IF;
END $$;

ALTER TABLE "queue"
  ADD COLUMN IF NOT EXISTS "activeIdentityKey" VARCHAR(500);

CREATE INDEX IF NOT EXISTS "queue_activeIdentityKey_idx"
  ON "queue"("activeIdentityKey");

CREATE UNIQUE INDEX IF NOT EXISTS "queue_active_identity_unique_idx"
  ON "queue"("barbershopId", "activeIdentityKey")
  WHERE "activeIdentityKey" IS NOT NULL
    AND "status" IN ('WAITING', 'IN_CHAIR');

CREATE TABLE IF NOT EXISTS "barbershop_onboardings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID NOT NULL,
  "profileConfirmedAt" TIMESTAMP(3),
  "scheduleConfirmedAt" TIMESTAMP(3),
  "servicesConfirmedAt" TIMESTAMP(3),
  "publicLinkValidatedAt" TIMESTAMP(3),
  "whatsappConfiguredAt" TIMESTAMP(3),
  "firstServiceCompletedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "barbershop_onboardings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "barbershop_onboardings_barbershopId_key" UNIQUE ("barbershopId"),
  CONSTRAINT "barbershop_onboardings_barbershopId_fkey"
    FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "cron_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jobName" VARCHAR(120) NOT NULL,
  "scheduledKey" VARCHAR(160) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cron_runs_jobName_scheduledKey_key" UNIQUE ("jobName", "scheduledKey")
);

CREATE INDEX IF NOT EXISTS "cron_runs_jobName_status_idx"
  ON "cron_runs"("jobName", "status");

CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "idempotencyKey" VARCHAR(100) NOT NULL,
  "scope" VARCHAR(160) NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "idempotency_records_scope_key_key" UNIQUE ("scope", "idempotencyKey")
);

CREATE INDEX IF NOT EXISTS "idempotency_records_createdAt_idx"
  ON "idempotency_records"("createdAt");
