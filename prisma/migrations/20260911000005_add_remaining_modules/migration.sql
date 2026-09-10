-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('INTAKE', 'AFTERCARE', 'FEEDBACK', 'CUSTOM');
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'DATE', 'BOOLEAN');
CREATE TYPE "TimeOffStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');
CREATE TYPE "PricingRuleType" AS ENUM ('PEAK_HOURS', 'HAPPY_HOUR', 'LOYALTY_DISCOUNT', 'FIRST_VISIT', 'WEATHER_BASED', 'DAY_OF_WEEK', 'SEASONAL', 'CUSTOM');
CREATE TYPE "VoucherType" AS ENUM ('PERCENT', 'FIXED', 'FREE_SERVICE', 'BUY_X_GET_Y');
CREATE TYPE "WalletEntryType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'TRANSFER', 'GIFT_CARD', 'CASHBACK');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CANCELED');
CREATE TYPE "CopilotSuggestionType" AS ENUM ('PRICING_OPTIMIZATION', 'SCHEDULE_GAP', 'CLIENT_WIN_BACK', 'STAFF_PERFORMANCE', 'INVENTORY_ALERT', 'CAMPAIGN_IDEA', 'REVENUE_TIP', 'RETENTION_RISK');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "CorporatePlanStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELED');
CREATE TYPE "CorporateSubStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED', 'SUSPENDED');

-- E3: custom_forms
CREATE TABLE "custom_forms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" "FormType" NOT NULL DEFAULT 'INTAKE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "custom_forms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "custom_forms_barbershopId_isActive_idx" ON "custom_forms"("barbershopId", "isActive");
ALTER TABLE "custom_forms" ADD CONSTRAINT "custom_forms_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- E3: form_fields
CREATE TABLE "form_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "formId" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "type" "FormFieldType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "placeholder" VARCHAR(200),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "form_fields_formId_idx" ON "form_fields"("formId");
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_formId_fkey" FOREIGN KEY ("formId") REFERENCES "custom_forms"("id") ON DELETE CASCADE;

-- E3: form_responses
CREATE TABLE "form_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "formId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "clientId" UUID,
    "appointmentId" UUID,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "form_responses_formId_idx" ON "form_responses"("formId");
CREATE INDEX "form_responses_barbershopId_submittedAt_idx" ON "form_responses"("barbershopId", "submittedAt");
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_formId_fkey" FOREIGN KEY ("formId") REFERENCES "custom_forms"("id") ON DELETE CASCADE;
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL;

-- E4: staff_schedules
CREATE TABLE "staff_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "staff_schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_schedules_barbershopId_staffId_dayOfWeek_key" ON "staff_schedules"("barbershopId", "staffId", "dayOfWeek");
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE;

-- E4: staff_services
CREATE TABLE "staff_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "customPrice" REAL,
    "customTime" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "staff_services_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_services_barbershopId_staffId_serviceId_key" ON "staff_services"("barbershopId", "staffId", "serviceId");
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE;

-- E4: staff_time_off
CREATE TABLE "staff_time_off" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "startAt" DATE NOT NULL,
    "endAt" DATE NOT NULL,
    "reason" TEXT,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_time_off_barbershopId_staffId_startAt_idx" ON "staff_time_off"("barbershopId", "staffId", "startAt");
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL;

-- F3: pricing_rules
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "PricingRuleType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "discountPercent" REAL NOT NULL DEFAULT 0,
    "surchargePercent" REAL NOT NULL DEFAULT 0,
    "startAt" TIMESTAMPTZ,
    "endAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pricing_rules_barbershopId_isActive_priority_idx" ON "pricing_rules"("barbershopId", "isActive", "priority");
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- G2: vouchers
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "type" "VoucherType" NOT NULL,
    "value" REAL NOT NULL,
    "minPurchase" REAL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "perClientLimit" INTEGER NOT NULL DEFAULT 1,
    "applicableServiceIds" JSONB,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vouchers_barbershopId_code_key" ON "vouchers"("barbershopId", "code");
CREATE INDEX "vouchers_barbershopId_isActive_idx" ON "vouchers"("barbershopId", "isActive");
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- G2: voucher_usages
CREATE TABLE "voucher_usages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "voucherId" UUID NOT NULL,
    "clientId" UUID,
    "appointmentId" UUID,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "usedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "voucher_usages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "voucher_usages_voucherId_idx" ON "voucher_usages"("voucherId");
CREATE INDEX "voucher_usages_clientId_idx" ON "voucher_usages"("clientId");
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE;
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL;

-- F4: salon_reputation
CREATE TABLE "salon_reputation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "avgRating" REAL NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "npsScore" REAL,
    "sentimentPositive" INTEGER NOT NULL DEFAULT 0,
    "sentimentNeutral" INTEGER NOT NULL DEFAULT 0,
    "sentimentNegative" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "salon_reputation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "salon_reputation_barbershopId_key" ON "salon_reputation"("barbershopId");
ALTER TABLE "salon_reputation" ADD CONSTRAINT "salon_reputation_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- F4: review_responses
CREATE TABLE "review_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewId" UUID NOT NULL,
    "respondedById" UUID,
    "content" TEXT NOT NULL,
    "respondedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "review_responses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "review_responses_reviewId_key" ON "review_responses"("reviewId");
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "client_reviews"("id") ON DELETE CASCADE;
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "users"("id") ON DELETE SET NULL;

-- G3: digital_wallets
CREATE TABLE "digital_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identityId" UUID NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "digital_wallets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "digital_wallets_identityId_key" ON "digital_wallets"("identityId");
ALTER TABLE "digital_wallets" ADD CONSTRAINT "digital_wallets_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "client_identities"("id") ON DELETE CASCADE;

-- G3: wallet_entries
CREATE TABLE "wallet_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "walletId" UUID NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" VARCHAR(300),
    "referenceId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wallet_entries_walletId_createdAt_idx" ON "wallet_entries"("walletId", "createdAt");
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "digital_wallets"("id") ON DELETE CASCADE;

-- F5: quality_protocols
CREATE TABLE "quality_protocols" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "checklistItems" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "quality_protocols_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quality_protocols_barbershopId_isActive_idx" ON "quality_protocols"("barbershopId", "isActive");
ALTER TABLE "quality_protocols" ADD CONSTRAINT "quality_protocols_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- F5: quality_audits
CREATE TABLE "quality_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocolId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "auditedById" UUID,
    "staffId" UUID,
    "results" JSONB NOT NULL DEFAULT '{}',
    "score" REAL,
    "notes" TEXT,
    "auditedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "quality_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quality_audits_protocolId_idx" ON "quality_audits"("protocolId");
CREATE INDEX "quality_audits_barbershopId_auditedAt_idx" ON "quality_audits"("barbershopId", "auditedAt");
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "quality_protocols"("id") ON DELETE CASCADE;
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_auditedById_fkey" FOREIGN KEY ("auditedById") REFERENCES "users"("id") ON DELETE SET NULL;

-- F6: purchase_orders
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "supplierId" UUID,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "expectedAt" TIMESTAMPTZ,
    "receivedAt" TIMESTAMPTZ,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_orders_barbershopId_status_idx" ON "purchase_orders"("barbershopId", "status");
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL;

-- F6: purchase_order_items
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "productId" UUID,
    "description" VARCHAR(200) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_order_items_orderId_idx" ON "purchase_order_items"("orderId");
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE;

-- F8: copilot_suggestions
CREATE TABLE "copilot_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "type" "CopilotSuggestionType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "copilot_suggestions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "copilot_suggestions_barbershopId_isRead_isDismissed_idx" ON "copilot_suggestions"("barbershopId", "isRead", "isDismissed");
ALTER TABLE "copilot_suggestions" ADD CONSTRAINT "copilot_suggestions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- G4: corporate_plans
CREATE TABLE "corporate_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "companyName" VARCHAR(200) NOT NULL,
    "cnpj" VARCHAR(20),
    "contactEmail" VARCHAR(200) NOT NULL,
    "contactPhone" VARCHAR(20),
    "maxUnits" INTEGER NOT NULL DEFAULT 1,
    "pricePerUnit" DECIMAL(12,2) NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "status" "CorporatePlanStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "corporate_plans_pkey" PRIMARY KEY ("id")
);

-- G4: corporate_subscriptions
CREATE TABLE "corporate_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "status" "CorporateSubStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "corporate_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "corporate_subscriptions_planId_barbershopId_key" ON "corporate_subscriptions"("planId", "barbershopId");
ALTER TABLE "corporate_subscriptions" ADD CONSTRAINT "corporate_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "corporate_plans"("id") ON DELETE CASCADE;
ALTER TABLE "corporate_subscriptions" ADD CONSTRAINT "corporate_subscriptions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- Add organizationId to barbershop if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='barbershops' AND column_name='organizationId') THEN
    ALTER TABLE "barbershops" ADD COLUMN "organizationId" UUID;
    ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Add clientIdentityId to salon_clients if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salon_clients' AND column_name='clientIdentityId') THEN
    ALTER TABLE "salon_clients" ADD COLUMN "clientIdentityId" UUID;
    ALTER TABLE "salon_clients" ADD CONSTRAINT "salon_clients_clientIdentityId_fkey" FOREIGN KEY ("clientIdentityId") REFERENCES "client_identities"("id") ON DELETE SET NULL;
  END IF;
END $$;
