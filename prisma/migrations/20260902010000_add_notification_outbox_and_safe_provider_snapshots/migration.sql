-- Unified notification ledger + durable outbox.
-- Additive migration: legacy email_deliveries/rawResponse remain available for rollback.

CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'PENDING', 'QUEUED', 'PROCESSING', 'RETRYING', 'SENT', 'DELIVERED',
  'READ', 'FAILED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'SKIPPED', 'CANCELED'
);
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED');
CREATE TYPE "NotificationAttemptStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "NotificationProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'RECONCILIATION_REQUIRED';

ALTER TABLE "payments" ADD COLUMN "providerSnapshot" JSONB;
-- Payloads legados podem conter PII do pagador. O snapshot seguro passa a ser
-- preenchido somente em novas gravações; o corpo integral não é preservado.
UPDATE "payments" SET "rawResponse" = NULL WHERE "rawResponse" IS NOT NULL;

ALTER TABLE "refunds"
  ADD COLUMN "idempotencyKey" VARCHAR(100),
  ADD COLUMN "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextReconciliationAt" TIMESTAMP(3),
  ADD COLUMN "lastReconciliationError" TEXT;

CREATE UNIQUE INDEX "refunds_paymentId_idempotencyKey_key"
  ON "refunds"("paymentId", "idempotencyKey");
CREATE INDEX "refunds_status_nextReconciliationAt_idx"
  ON "refunds"("status", "nextReconciliationAt");

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID,
  "clientId" UUID,
  "userId" UUID,
  "campaignRecipientId" UUID,
  "channel" "NotificationChannel" NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "templateKey" VARCHAR(100),
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" VARCHAR(180) NOT NULL,
  "destinationMasked" VARCHAR(200) NOT NULL,
  "destinationHash" VARCHAR(64) NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(40),
  "providerId" VARCHAR(160),
  "errorCode" VARCHAR(100),
  "errorMessage" VARCHAR(500),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "sourceType" VARCHAR(80),
  "sourceId" VARCHAR(160),
  "retryOfId" UUID,
  "queuedAt" TIMESTAMP(3),
  "processingAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "delayedAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_deliveries_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notification_deliveries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "notification_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "notification_deliveries_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "crm_campaign_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "notification_deliveries_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "notification_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_deliveries_campaignRecipientId_key" ON "notification_deliveries"("campaignRecipientId");
CREATE UNIQUE INDEX "notification_deliveries_channel_idempotencyKey_key" ON "notification_deliveries"("channel", "idempotencyKey");
CREATE INDEX "notification_deliveries_barbershopId_createdAt_idx" ON "notification_deliveries"("barbershopId", "createdAt");
CREATE INDEX "notification_deliveries_barbershopId_status_createdAt_idx" ON "notification_deliveries"("barbershopId", "status", "createdAt");
CREATE INDEX "notification_deliveries_provider_providerId_idx" ON "notification_deliveries"("provider", "providerId");
CREATE INDEX "notification_deliveries_destinationHash_createdAt_idx" ON "notification_deliveries"("destinationHash", "createdAt");
CREATE INDEX "notification_deliveries_sourceType_sourceId_idx" ON "notification_deliveries"("sourceType", "sourceId");

CREATE TABLE "notification_outbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deliveryId" UUID NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "payloadCiphertext" TEXT NOT NULL,
  "payloadIv" VARCHAR(32) NOT NULL,
  "payloadTag" VARCHAR(32) NOT NULL,
  "keyVersion" VARCHAR(32) NOT NULL,
  "publishAttempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" VARCHAR(100),
  "publishedAt" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "purgeAfter" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_outbox_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "notification_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notification_outbox_deliveryId_key" ON "notification_outbox"("deliveryId");
CREATE INDEX "notification_outbox_status_nextAttemptAt_idx" ON "notification_outbox"("status", "nextAttemptAt");
CREATE INDEX "notification_outbox_lockedAt_idx" ON "notification_outbox"("lockedAt");
CREATE INDEX "notification_outbox_purgeAfter_idx" ON "notification_outbox"("purgeAfter");

CREATE TABLE "notification_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deliveryId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "NotificationAttemptStatus" NOT NULL DEFAULT 'PROCESSING',
  "providerId" VARCHAR(160),
  "providerStatus" VARCHAR(100),
  "httpStatus" INTEGER,
  "errorCode" VARCHAR(100),
  "errorMessage" VARCHAR(500),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_attempts_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "notification_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notification_attempts_deliveryId_attemptNumber_key" ON "notification_attempts"("deliveryId", "attemptNumber");
CREATE INDEX "notification_attempts_status_startedAt_idx" ON "notification_attempts"("status", "startedAt");

CREATE TABLE "notification_provider_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deliveryId" UUID,
  "provider" VARCHAR(40) NOT NULL,
  "eventId" VARCHAR(180) NOT NULL,
  "eventType" VARCHAR(100) NOT NULL,
  "providerObjectId" VARCHAR(180),
  "payloadHash" VARCHAR(64) NOT NULL,
  "status" "NotificationProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "occurredAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "errorMessage" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_provider_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_provider_events_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "notification_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notification_provider_events_provider_eventId_key" ON "notification_provider_events"("provider", "eventId");
CREATE INDEX "notification_provider_events_provider_providerObjectId_idx" ON "notification_provider_events"("provider", "providerObjectId");
CREATE INDEX "notification_provider_events_status_createdAt_idx" ON "notification_provider_events"("status", "createdAt");

CREATE TABLE "notification_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notification_preferences_barbershopId_channel_type_key" ON "notification_preferences"("barbershopId", "channel", "type");
CREATE INDEX "notification_preferences_barbershopId_enabled_idx" ON "notification_preferences"("barbershopId", "enabled");

CREATE TABLE "notification_suppressions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID,
  "scopeKey" VARCHAR(50) NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "destinationHash" VARCHAR(64) NOT NULL,
  "destinationMasked" VARCHAR(200) NOT NULL,
  "reason" VARCHAR(100) NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_suppressions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_suppressions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notification_suppressions_scopeKey_channel_destinationHash_key" ON "notification_suppressions"("scopeKey", "channel", "destinationHash");
CREATE INDEX "notification_suppressions_barbershopId_active_idx" ON "notification_suppressions"("barbershopId", "active");
CREATE INDEX "notification_suppressions_channel_destinationHash_active_idx" ON "notification_suppressions"("channel", "destinationHash", "active");

-- Tenant isolation. Global/platform rows are visible only with the explicit master/system context ('').
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_deliveries"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );
ALTER TABLE "notification_deliveries" FORCE ROW LEVEL SECURITY;

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_preferences"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "notification_suppressions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_suppressions"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" IS NULL
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );
ALTER TABLE "notification_suppressions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_outbox"
  USING (
      COALESCE(current_setting('app.current_barbershop_id', true), '') = '' OR EXISTS (
      SELECT 1 FROM "notification_deliveries" d
      WHERE d."id" = "notification_outbox"."deliveryId"
          AND d."barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
    )
  );
ALTER TABLE "notification_outbox" FORCE ROW LEVEL SECURITY;

ALTER TABLE "notification_attempts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_attempts"
  USING (
      COALESCE(current_setting('app.current_barbershop_id', true), '') = '' OR EXISTS (
      SELECT 1 FROM "notification_deliveries" d
      WHERE d."id" = "notification_attempts"."deliveryId"
          AND d."barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
    )
  );
ALTER TABLE "notification_attempts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "notification_provider_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_provider_events"
  USING (
      COALESCE(current_setting('app.current_barbershop_id', true), '') = '' OR EXISTS (
      SELECT 1 FROM "notification_deliveries" d
      WHERE d."id" = "notification_provider_events"."deliveryId"
          AND d."barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
    )
  );
ALTER TABLE "notification_provider_events" FORCE ROW LEVEL SECURITY;
