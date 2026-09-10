-- CreateEnum
CREATE TYPE "AiConversationStatus" AS ENUM ('ACTIVE', 'TRANSFERRED_TO_HUMAN', 'CLOSED', 'EXPIRED');
CREATE TYPE "AiMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "AiMessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'LOCATION');
CREATE TYPE "AiHandledBy" AS ENUM ('AI', 'HUMAN', 'HYBRID');
CREATE TYPE "NfeEnvironment" AS ENUM ('HOMOLOGATION', 'PRODUCTION');
CREATE TYPE "NfeStatus" AS ENUM ('PENDING', 'PROCESSING', 'AUTHORIZED', 'REJECTED', 'CANCELED', 'ERROR');
CREATE TYPE "IntegrationType" AS ENUM ('GOOGLE_CALENDAR', 'ICALENDAR', 'TWILIO', 'EVOLUTION_API', 'OPENAI', 'ASAAS', 'NFSE', 'ZAPI', 'WHATSAPP_CLOUD');
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'RATE_LIMITED');
CREATE TYPE "SyncDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'BIDIRECTIONAL');
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- E5: ai_conversations
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "normalizedPhone" VARCHAR(15) NOT NULL,
    "status" "AiConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "context" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "lastMessageAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "endedAt" TIMESTAMPTZ,
    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_conversations_barbershopId_normalizedPhone_idx" ON "ai_conversations"("barbershopId", "normalizedPhone");
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- E5: ai_messages
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "direction" "AiMessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" "AiMessageType" NOT NULL DEFAULT 'TEXT',
    "intent" VARCHAR(100),
    "entities" JSONB NOT NULL DEFAULT '{}',
    "confidence" REAL,
    "sentAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_messages_conversationId_sentAt_idx" ON "ai_messages"("conversationId", "sentAt");
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE;

-- E5: ai_intent_logs
CREATE TABLE "ai_intent_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "intent" VARCHAR(100) NOT NULL,
    "entities" JSONB NOT NULL DEFAULT '{}',
    "confidence" REAL NOT NULL,
    "handledBy" "AiHandledBy" NOT NULL DEFAULT 'AI',
    "resolution" VARCHAR(200),
    "loggedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "ai_intent_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_intent_logs_barbershopId_loggedAt_idx" ON "ai_intent_logs"("barbershopId", "loggedAt");
ALTER TABLE "ai_intent_logs" ADD CONSTRAINT "ai_intent_logs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- F1: fiscal_configs
CREATE TABLE "fiscal_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "cnpj" VARCHAR(20) NOT NULL,
    "stateRegistration" VARCHAR(20),
    "municipalRegistration" VARCHAR(20),
    "serviceCode" VARCHAR(20),
    "activityCode" VARCHAR(20),
    "nfeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nfeEnvironment" "NfeEnvironment" NOT NULL DEFAULT 'HOMOLOGATION',
    "digitalCertPath" VARCHAR(500),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "fiscal_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fiscal_configs_barbershopId_key" ON "fiscal_configs"("barbershopId");
ALTER TABLE "fiscal_configs" ADD CONSTRAINT "fiscal_configs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- F1: nfe_records
CREATE TABLE "nfe_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "configId" UUID NOT NULL,
    "appointmentId" UUID,
    "nfseNumber" VARCHAR(50),
    "nfseProtocol" VARCHAR(100),
    "status" "NfeStatus" NOT NULL DEFAULT 'PENDING',
    "xmlContent" TEXT,
    "pdfUrl" VARCHAR(500),
    "recipientName" VARCHAR(200) NOT NULL,
    "recipientDoc" VARCHAR(20) NOT NULL,
    "serviceValue" DECIMAL(12,2) NOT NULL,
    "taxValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMPTZ,
    "canceledAt" TIMESTAMPTZ,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "nfe_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "nfe_records_barbershopId_status_idx" ON "nfe_records"("barbershopId", "status");
ALTER TABLE "nfe_records" ADD CONSTRAINT "nfe_records_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "nfe_records" ADD CONSTRAINT "nfe_records_configId_fkey" FOREIGN KEY ("configId") REFERENCES "fiscal_configs"("id") ON DELETE CASCADE;

-- F7: integrations
CREATE TABLE "integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'INACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMPTZ,
    "syncError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "integrations_barbershopId_type_provider_key" ON "integrations"("barbershopId", "type", "provider");
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- F7: integration_sync_logs
CREATE TABLE "integration_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integrationId" UUID NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "recordsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "completedAt" TIMESTAMPTZ,
    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "integration_sync_logs_integrationId_startedAt_idx" ON "integration_sync_logs"("integrationId", "startedAt");
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE;
