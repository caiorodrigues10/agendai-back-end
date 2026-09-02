-- MVP público: idempotência de cobrança, ausência em agenda, backfill observável e solicitação LGPD.

ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "idempotencyKey" VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_subscriptionId_idempotencyKey_key"
  ON "invoices"("subscriptionId", "idempotencyKey");

CREATE TYPE "CrmBackfillRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TABLE "crm_backfill_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID NOT NULL,
  "version" VARCHAR(40) NOT NULL,
  "status" "CrmBackfillRunStatus" NOT NULL DEFAULT 'RUNNING',
  "linkedRecords" INTEGER NOT NULL DEFAULT 0,
  "createdEvents" INTEGER NOT NULL DEFAULT 0,
  "totalEvents" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "crm_backfill_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_backfill_runs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "crm_backfill_runs_barbershopId_startedAt_idx" ON "crm_backfill_runs"("barbershopId", "startedAt");
ALTER TABLE "crm_backfill_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "crm_backfill_runs"
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);
ALTER TABLE "crm_backfill_runs" FORCE ROW LEVEL SECURITY;

CREATE TYPE "AccountDeletionRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELED');
CREATE TABLE "account_deletion_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "status" "AccountDeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" VARCHAR(500),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "account_deletion_requests_userId_requestedAt_idx" ON "account_deletion_requests"("userId", "requestedAt");
CREATE INDEX "account_deletion_requests_status_requestedAt_idx" ON "account_deletion_requests"("status", "requestedAt");
