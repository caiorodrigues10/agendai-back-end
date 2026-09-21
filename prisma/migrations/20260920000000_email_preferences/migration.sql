-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('ESSENTIAL', 'OPERATION', 'MARKETING');

-- CreateTable
CREATE TABLE "salon_email_preferences" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "EmailCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salon_email_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barbershop_email_settings" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "dailyDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigestTime" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "urgentAppointmentWindowHours" INTEGER NOT NULL DEFAULT 24,
    "lowStockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "performanceSummaryFrequency" VARCHAR(20) NOT NULL DEFAULT 'weekly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barbershop_email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_logs" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "userId" UUID,
    "template" VARCHAR(64) NOT NULL,
    "category" "EmailCategory" NOT NULL,
    "to" VARCHAR(200) NOT NULL,
    "recipientMasked" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerId" VARCHAR(128),
    "errorCode" VARCHAR(64),
    "errorMessage" TEXT,
    "idempotencyKey" VARCHAR(180),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salon_email_preferences_user_shop_category_key" ON "salon_email_preferences"("userId", "barbershopId", "category");

-- CreateIndex
CREATE INDEX "salon_email_preferences_barbershopId_idx" ON "salon_email_preferences"("barbershopId");

-- CreateIndex
CREATE INDEX "salon_email_preferences_userId_category_idx" ON "salon_email_preferences"("userId", "category");

-- CreateIndex
CREATE INDEX "barbershop_email_settings_barbershopId_idx" ON "barbershop_email_settings"("barbershopId");

-- CreateIndex
CREATE INDEX "email_delivery_logs_barbershopId_createdAt_idx" ON "email_delivery_logs"("barbershopId", "createdAt");

-- CreateIndex
CREATE INDEX "email_delivery_logs_userId_createdAt_idx" ON "email_delivery_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "email_delivery_logs_category_idx" ON "email_delivery_logs"("category");

-- CreateIndex
CREATE INDEX "email_delivery_logs_status_idx" ON "email_delivery_logs"("status");

-- CreateIndex
CREATE INDEX "email_delivery_logs_providerId_idx" ON "email_delivery_logs"("providerId");

-- AddForeignKey
ALTER TABLE "salon_email_preferences" ADD CONSTRAINT "salon_email_preferences_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_email_preferences" ADD CONSTRAINT "salon_email_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbershop_email_settings" ADD CONSTRAINT "barbershop_email_settings_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "salon_email_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "barbershop_email_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_delivery_logs" ENABLE ROW LEVEL SECURITY;

-- Force RLS for app user
ALTER TABLE "salon_email_preferences" FORCE ROW LEVEL SECURITY;
ALTER TABLE "barbershop_email_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "email_delivery_logs" FORCE ROW LEVEL SECURITY;

-- Policies (tenant isolation via barbershopId; user reads only own preference)
CREATE POLICY "tenant_isolation" ON "salon_email_preferences"
    USING ("barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

CREATE POLICY "tenant_isolation" ON "barbershop_email_settings"
    USING ("barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

CREATE POLICY "tenant_isolation" ON "email_delivery_logs"
    USING ("barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);
