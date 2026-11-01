-- AlterTable
ALTER TABLE "crm_backfill_runs" ADD COLUMN     "scope" VARCHAR(20) NOT NULL DEFAULT 'TENANT',
ADD COLUMN     "triggeredById" UUID;

-- CreateIndex
CREATE INDEX "crm_backfill_runs_scope_startedAt_idx" ON "crm_backfill_runs"("scope", "startedAt");
