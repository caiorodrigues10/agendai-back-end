-- AlterTable
ALTER TABLE "owner_bot_action_logs" ADD COLUMN     "affectedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "canUndo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "commandId" VARCHAR(60),
ADD COLUMN     "riskClass" VARCHAR(20),
ADD COLUMN     "undoneAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "owner_bot_preferences" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedAt" TIMESTAMP(3),
    "briefingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "briefingTime" VARCHAR(5) NOT NULL DEFAULT '07:30',
    "summaryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "summaryTime" VARCHAR(5) NOT NULL DEFAULT '21:00',
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "alertTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tone" VARCHAR(20) NOT NULL DEFAULT 'FRIENDLY',
    "language" VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    "lastBriefingAt" TIMESTAMP(3),
    "lastSummaryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_bot_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_bot_campaigns" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "messagePreview" TEXT NOT NULL,
    "recipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "owner_bot_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_bot_preferences_barbershopId_key" ON "owner_bot_preferences"("barbershopId");

-- CreateIndex
CREATE INDEX "owner_bot_campaigns_barbershopId_createdAt_idx" ON "owner_bot_campaigns"("barbershopId", "createdAt");

-- CreateIndex
CREATE INDEX "owner_bot_action_logs_barbershopId_commandId_idx" ON "owner_bot_action_logs"("barbershopId", "commandId");

-- AddForeignKey
ALTER TABLE "owner_bot_preferences" ADD CONSTRAINT "owner_bot_preferences_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_bot_campaigns" ADD CONSTRAINT "owner_bot_campaigns_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_bot_campaigns" ADD CONSTRAINT "owner_bot_campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: isolamento por tenant (barbershop). COALESCE trata o GUC ausente
-- como '' (acesso sem setRlsContext) e NULLIF evita erro de cast de '' para uuid.
ALTER TABLE "owner_bot_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_bot_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "owner_bot_preferences"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

ALTER TABLE "owner_bot_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_bot_campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "owner_bot_campaigns"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );
