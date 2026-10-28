-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('APP', 'PUBLIC', 'WHATSAPP_OWNER_BOT');

-- CreateEnum
CREATE TYPE "OwnerBotLinkCodeStatus" AS ENUM ('PENDING', 'CONSUMED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OwnerBotActionStatus" AS ENUM ('SUCCESS', 'ERROR', 'NEEDS_CONFIRMATION', 'BLOCKED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "source" "AppointmentSource" NOT NULL DEFAULT 'APP';

-- CreateTable
CREATE TABLE "owner_bot_link_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "codeHash" VARCHAR(200) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "status" "OwnerBotLinkCodeStatus" NOT NULL DEFAULT 'PENDING',
    "ipAddress" VARCHAR(45),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "owner_bot_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_bot_links" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "normalizedPhone" VARCHAR(15) NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_bot_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_bot_action_logs" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "userId" UUID,
    "phoneMasked" VARCHAR(20),
    "action" VARCHAR(60) NOT NULL,
    "status" "OwnerBotActionStatus" NOT NULL DEFAULT 'SUCCESS',
    "request" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "errorMessage" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_bot_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_bot_link_codes_userId_status_idx" ON "owner_bot_link_codes"("userId", "status");

-- CreateIndex
CREATE INDEX "owner_bot_link_codes_barbershopId_status_idx" ON "owner_bot_link_codes"("barbershopId", "status");

-- CreateIndex
CREATE INDEX "owner_bot_link_codes_expiresAt_idx" ON "owner_bot_link_codes"("expiresAt");

-- CreateIndex
CREATE INDEX "owner_bot_links_userId_idx" ON "owner_bot_links"("userId");

-- CreateIndex
CREATE INDEX "owner_bot_links_barbershopId_idx" ON "owner_bot_links"("barbershopId");

-- CreateIndex
CREATE INDEX "owner_bot_links_normalizedPhone_idx" ON "owner_bot_links"("normalizedPhone");

-- CreateIndex
CREATE INDEX "owner_bot_action_logs_barbershopId_createdAt_idx" ON "owner_bot_action_logs"("barbershopId", "createdAt");

-- CreateIndex
CREATE INDEX "owner_bot_action_logs_userId_createdAt_idx" ON "owner_bot_action_logs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "owner_bot_link_codes" ADD CONSTRAINT "owner_bot_link_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_bot_link_codes" ADD CONSTRAINT "owner_bot_link_codes_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_bot_links" ADD CONSTRAINT "owner_bot_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_bot_links" ADD CONSTRAINT "owner_bot_links_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_bot_action_logs" ADD CONSTRAINT "owner_bot_action_logs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_bot_action_logs" ADD CONSTRAINT "owner_bot_action_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS: isolamento por tenant (barbershop). COALESCE trata o GUC ausente
-- como '' (acesso sem setRlsContext) e NULLIF evita erro de cast de '' para uuid.
ALTER TABLE "owner_bot_link_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_bot_link_codes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "owner_bot_link_codes"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

ALTER TABLE "owner_bot_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_bot_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "owner_bot_links"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

ALTER TABLE "owner_bot_action_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_bot_action_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "owner_bot_action_logs"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );
