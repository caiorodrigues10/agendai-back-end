-- Rename enums
ALTER TYPE "MembershipCycleType" RENAME TO "RecurringPackageCycleType";
ALTER TYPE "MembershipStatus" RENAME TO "RecurringPackageStatus";

-- Rename tables (preserving IDs, records, and indexes)
ALTER TABLE "salon_membership_plans" RENAME TO "salon_recurring_package_plans";
ALTER TABLE "membership_benefits" RENAME TO "recurring_package_benefits";
ALTER TABLE "client_memberships" RENAME TO "client_recurring_packages";
ALTER TABLE "membership_cycles" RENAME TO "recurring_package_cycles";
ALTER TABLE "membership_usages" RENAME TO "recurring_package_usages";

-- Rename columns in recurring_package_cycles (membershipId → packageId)
ALTER TABLE "recurring_package_cycles" RENAME COLUMN "membershipId" TO "packageId";

-- Rename columns in recurring_package_usages (membershipId → packageId)
ALTER TABLE "recurring_package_usages" RENAME COLUMN "membershipId" TO "packageId";

-- Rename foreign key constraints (PostgreSQL auto-renames indexes, but we need to handle FKs)
-- Drop old FKs and create new ones with correct names
ALTER TABLE "recurring_package_benefits" DROP CONSTRAINT IF EXISTS "membership_benefits_planId_fkey";
ALTER TABLE "recurring_package_benefits" ADD CONSTRAINT "recurring_package_benefits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "salon_recurring_package_plans"("id") ON DELETE CASCADE;

ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_memberships_planId_fkey";
ALTER TABLE "client_recurring_packages" ADD CONSTRAINT "client_recurring_packages_planId_fkey" FOREIGN KEY ("planId") REFERENCES "salon_recurring_package_plans"("id") ON DELETE RESTRICT;

ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_memberships_barbershopId_fkey";
ALTER TABLE "client_recurring_packages" ADD CONSTRAINT "client_recurring_packages_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_memberships_clientId_fkey";
ALTER TABLE "client_recurring_packages" ADD CONSTRAINT "client_recurring_packages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE;

ALTER TABLE "recurring_package_cycles" DROP CONSTRAINT IF EXISTS "membership_cycles_membershipId_fkey";
ALTER TABLE "recurring_package_cycles" ADD CONSTRAINT "recurring_package_cycles_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "client_recurring_packages"("id") ON DELETE CASCADE;

ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "membership_usages_membershipId_fkey";
ALTER TABLE "recurring_package_usages" ADD CONSTRAINT "recurring_package_usages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "client_recurring_packages"("id") ON DELETE CASCADE;

ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "membership_usages_benefitId_fkey";
ALTER TABLE "recurring_package_usages" ADD CONSTRAINT "recurring_package_usages_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "recurring_package_benefits"("id") ON DELETE RESTRICT;

ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "membership_usages_appointmentId_fkey";
ALTER TABLE "recurring_package_usages" ADD CONSTRAINT "recurring_package_usages_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL;

-- Recreate unique constraint with new name
ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_memberships_barbershopId_clientId_planId_key";
ALTER TABLE "client_recurring_packages" ADD CONSTRAINT "client_recurring_packages_barbershopId_clientId_planId_key" UNIQUE ("barbershopId", "clientId", "planId");

-- Add updatedById to expenses and fiados
ALTER TABLE "expenses" ADD COLUMN "updatedById" UUID;
ALTER TABLE "fiados" ADD COLUMN "updatedById" UUID;

-- Create financial correction log table
CREATE TABLE "financial_correction_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "correctedById" UUID NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousAmount" REAL NOT NULL,
    "newAmount" REAL NOT NULL,
    "reason" VARCHAR(500),

    CONSTRAINT "financial_correction_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_correction_logs_barbershopId_entityType_entityId_idx" ON "financial_correction_logs"("barbershopId", "entityType", "entityId");
CREATE INDEX "financial_correction_logs_correctedById_idx" ON "financial_correction_logs"("correctedById");

-- Update RLS policies for renamed tables
DROP POLICY IF EXISTS "tenant_isolation" ON "salon_recurring_package_plans";
DROP POLICY IF EXISTS "tenant_isolation" ON "recurring_package_benefits";
DROP POLICY IF EXISTS "tenant_isolation" ON "client_recurring_packages";
DROP POLICY IF EXISTS "recurring_package_cycles" . "tenant_isolation";
DROP POLICY IF EXISTS "recurring_package_usages" . "tenant_isolation";

CREATE POLICY "tenant_isolation" ON "salon_recurring_package_plans"
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

CREATE POLICY "tenant_isolation" ON "recurring_package_benefits"
  USING (current_setting('app.current_barbershop_id', true) = '' OR EXISTS (SELECT 1 FROM "salon_recurring_package_plans" WHERE id = "planId" AND "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid));

CREATE POLICY "tenant_isolation" ON "client_recurring_packages"
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

CREATE POLICY "tenant_isolation" ON "recurring_package_cycles"
  USING (current_setting('app.current_barbershop_id', true) = '' OR EXISTS (SELECT 1 FROM "client_recurring_packages" WHERE id = "packageId" AND "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid));

CREATE POLICY "tenant_isolation" ON "recurring_package_usages"
  USING (current_setting('app.current_barbershop_id', true) = '' OR EXISTS (SELECT 1 FROM "client_recurring_packages" WHERE id = "packageId" AND "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid));

ALTER TABLE "salon_recurring_package_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "recurring_package_benefits" FORCE ROW LEVEL SECURITY;
ALTER TABLE "client_recurring_packages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "recurring_package_cycles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "recurring_package_usages" FORCE ROW LEVEL SECURITY;
