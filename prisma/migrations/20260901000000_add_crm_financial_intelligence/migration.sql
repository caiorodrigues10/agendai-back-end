-- CRM financeiro: identidade explícita, ledger imutável e campanhas assistidas.

ALTER TABLE "queue" ADD COLUMN "clientId" UUID;
ALTER TABLE "fiados" ADD COLUMN "clientId" UUID;

ALTER TABLE "salon_clients" ADD COLUMN "normalizedWhatsapp" VARCHAR(11);
ALTER TABLE "salon_clients" ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "salon_clients" ADD COLUMN "marketingOptInAt" TIMESTAMP(3);
ALTER TABLE "salon_clients" ADD COLUMN "marketingOptInSource" VARCHAR(80);

-- As chaves artificiais np:* eram uma tentativa de deduplicar por nome. Elas não
-- representam telefone e passam a ser registros sem telefone, nunca auto-mesclados.
UPDATE "salon_clients"
SET "whatsapp" = ''
WHERE "whatsapp" LIKE 'np:%';

UPDATE "salon_clients"
SET "normalizedWhatsapp" = CASE
  WHEN regexp_replace("whatsapp", '\\D', '', 'g') ~ '^(55)?[0-9]{10,11}$'
    THEN regexp_replace(regexp_replace("whatsapp", '\\D', '', 'g'), '^55', '')
  ELSE NULL
END;

-- Mantém a primeira ficha quando havia o mesmo telefone em formatos distintos.
WITH duplicated AS (
  SELECT id,
         row_number() OVER (PARTITION BY "barbershopId", "normalizedWhatsapp" ORDER BY "createdAt", id) AS position
  FROM "salon_clients"
  WHERE "normalizedWhatsapp" IS NOT NULL
)
UPDATE "salon_clients" sc
SET "normalizedWhatsapp" = NULL
FROM duplicated d
WHERE sc.id = d.id AND d.position > 1;

ALTER TABLE "salon_clients" DROP CONSTRAINT IF EXISTS "salon_clients_barbershopId_whatsapp_key";
CREATE UNIQUE INDEX "salon_clients_barbershopId_normalizedWhatsapp_key"
  ON "salon_clients"("barbershopId", "normalizedWhatsapp");

ALTER TABLE "queue" ADD CONSTRAINT "queue_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiados" ADD CONSTRAINT "fiados_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "queue_clientId_idx" ON "queue"("clientId");
CREATE INDEX "fiados_clientId_idx" ON "fiados"("clientId");

CREATE TYPE "CrmFinancialEventKind" AS ENUM ('SERVICE_COMPLETED', 'PACKAGE_SOLD', 'FIADO_CREATED', 'FIADO_PAYMENT', 'REFUND');
CREATE TYPE "CrmCampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'PARTIAL', 'FAILED', 'CANCELED');
CREATE TYPE "CrmCampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "crm_financial_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "kind" "CrmFinancialEventKind" NOT NULL,
  "sourceType" VARCHAR(40) NOT NULL,
  "sourceId" UUID NOT NULL,
  "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "receivedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "outstandingDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_financial_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crm_financial_events_source_unique" ON "crm_financial_events"("barbershopId", "sourceType", "sourceId", "kind");
CREATE INDEX "crm_financial_events_barbershopId_occurredAt_idx" ON "crm_financial_events"("barbershopId", "occurredAt");
CREATE INDEX "crm_financial_events_clientId_occurredAt_idx" ON "crm_financial_events"("clientId", "occurredAt");
ALTER TABLE "crm_financial_events" ADD CONSTRAINT "crm_financial_events_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_financial_events" ADD CONSTRAINT "crm_financial_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "crm_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "segment" VARCHAR(60) NOT NULL,
  "message" TEXT NOT NULL,
  "status" "CrmCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  CONSTRAINT "crm_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "crm_campaigns_barbershopId_createdAt_idx" ON "crm_campaigns"("barbershopId", "createdAt");
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "crm_campaign_recipients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaignId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "status" "CrmCampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_campaign_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crm_campaign_recipients_campaignId_clientId_key" ON "crm_campaign_recipients"("campaignId", "clientId");
CREATE INDEX "crm_campaign_recipients_clientId_idx" ON "crm_campaign_recipients"("clientId");
ALTER TABLE "crm_campaign_recipients" ADD CONSTRAINT "crm_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "crm_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_campaign_recipients" ADD CONSTRAINT "crm_campaign_recipients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm_financial_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_campaign_recipients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "crm_financial_events" USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);
CREATE POLICY tenant_isolation ON "crm_campaigns" USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);
CREATE POLICY tenant_isolation ON "crm_campaign_recipients" USING (current_setting('app.current_barbershop_id', true) = '' OR EXISTS (SELECT 1 FROM "crm_campaigns" c WHERE c.id = "campaignId" AND (current_setting('app.current_barbershop_id', true) = '' OR c."barbershopId" = current_setting('app.current_barbershop_id', true)::uuid)));
ALTER TABLE "crm_financial_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "crm_campaigns" FORCE ROW LEVEL SECURITY;
ALTER TABLE "crm_campaign_recipients" FORCE ROW LEVEL SECURITY;
