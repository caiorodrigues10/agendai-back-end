-- Gift cards
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'PARTIALLY_USED', 'EXHAUSTED', 'EXPIRED', 'CANCELED');
CREATE TABLE "gift_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "initialBalance" DECIMAL(12,2) NOT NULL,
    "currentBalance" DECIMAL(12,2) NOT NULL,
    "buyerName" VARCHAR(200),
    "buyerPhone" VARCHAR(20),
    "recipientName" VARCHAR(200),
    "recipientPhone" VARCHAR(20),
    "purchaserId" UUID,
    "recipientId" UUID,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ,
    "purchasedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "redeemedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gift_cards_code_key" ON "gift_cards"("code");
CREATE INDEX "gift_cards_barbershopId_status_idx" ON "gift_cards"("barbershopId", "status");
CREATE INDEX "gift_cards_code_idx" ON "gift_cards"("code");
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_purchaserId_fkey" FOREIGN KEY ("purchaserId") REFERENCES "salon_clients"("id") ON DELETE SET NULL;
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL;

CREATE TABLE "gift_card_usages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "giftCardId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "appointmentId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "gift_card_usages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gift_card_usages_giftCardId_idx" ON "gift_card_usages"("giftCardId");
ALTER TABLE "gift_card_usages" ADD CONSTRAINT "gift_card_usages_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id") ON DELETE CASCADE;

-- Profit engine
CREATE TABLE "profit_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "period" DATE NOT NULL,
    "serviceId" UUID,
    "staffId" UUID,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "directCosts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overheadCosts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionAmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "marginPercent" REAL NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "profit_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "profit_entries_barbershopId_period_serviceId_staffId_key" ON "profit_entries"("barbershopId", "period", "serviceId", "staffId");
CREATE INDEX "profit_entries_barbershopId_period_idx" ON "profit_entries"("barbershopId", "period");
ALTER TABLE "profit_entries" ADD CONSTRAINT "profit_entries_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

CREATE TABLE "profit_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "defaultTaxRate" REAL NOT NULL DEFAULT 0,
    "defaultCommission" REAL NOT NULL DEFAULT 0,
    "overheadCategories" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "profit_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "profit_settings_barbershopId_key" ON "profit_settings"("barbershopId");
ALTER TABLE "profit_settings" ADD CONSTRAINT "profit_settings_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- Resources
CREATE TYPE "ResourceType" AS ENUM ('ROOM', 'CHAIR', 'EQUIPMENT', 'VEHICLE', 'OTHER');
CREATE TYPE "ResourceBookingStatus" AS ENUM ('CONFIRMED', 'CANCELED', 'COMPLETED');
CREATE TABLE "resources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "ResourceType" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resources_barbershopId_type_idx" ON "resources"("barbershopId", "type");
ALTER TABLE "resources" ADD CONSTRAINT "resources_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

CREATE TABLE "resource_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resourceId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "appointmentId" UUID,
    "staffId" UUID,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endTime" TIMESTAMPTZ NOT NULL,
    "status" "ResourceBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "resource_bookings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resource_bookings_resourceId_startAt_idx" ON "resource_bookings"("resourceId", "startAt");
CREATE INDEX "resource_bookings_barbershopId_startAt_idx" ON "resource_bookings"("barbershopId", "startAt");
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE CASCADE;
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL;

-- Organizations and barbershop association
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "ownerId" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "logoUrl" VARCHAR(500),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_ownerId_idx" ON "organizations"("ownerId");
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE;
-- A coluna organizationId já é criada em 20260911000005 em bancos novos;
-- os guards abaixo deixam este passo idempotente nos dois caminhos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'barbershops' AND column_name = 'organizationId'
  ) THEN
    ALTER TABLE "barbershops" ADD COLUMN "organizationId" UUID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'barbershops_organizationId_idx'
  ) THEN
    CREATE INDEX "barbershops_organizationId_idx" ON "barbershops"("organizationId");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'barbershops_organizationId_fkey' AND conrelid = '"barbershops"'::regclass
  ) THEN
    ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE TYPE "OrgMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OrgMemberRole" NOT NULL DEFAULT 'MEMBER',
    "invitedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "acceptedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
