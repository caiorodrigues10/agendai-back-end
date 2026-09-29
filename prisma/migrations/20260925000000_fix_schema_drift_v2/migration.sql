-- Drift corretivo v2 (schema Prisma x banco de produção)
-- Gerado de `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
-- e transformado para ser seguro e reexecutável:
--   * CREATE TYPE / CREATE INDEX / DROP * com guards (IF [NOT] EXISTS)
--   * text -> enum via ALTER COLUMN TYPE ... USING (preserva dados;
--     o script cru do Prisma usava DROP+ADD COLUMN, que apagaria os dados)
--   * cada ADD CONSTRAINT vem precedido de DROP CONSTRAINT IF EXISTS
--   * RENAME de constraint/índice só executa se o nome antigo existir
--   * dedupe de users.cpf antes do índice único users_cpf_key

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DepositRequiredMode" AS ENUM ('OFF', 'OPTIONAL', 'MANDATORY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAIVED', 'EXPIRED', 'APPLIED', 'REFUNDED', 'FORFEITED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RefundRule" AS ENUM ('FULL_REFUND', 'PARTIAL_REFUND', 'CREDIT_ONLY', 'NO_REFUND');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'BOOKED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WaitlistOrigin" AS ENUM ('PUBLIC', 'STAFF', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WaitlistOfferResponse" AS ENUM ('ACCEPTED', 'DECLINED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RiskLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'SUGGESTION';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'FEEDBACK';

-- AlterEnum
ALTER TYPE "TicketChannel" ADD VALUE IF NOT EXISTS 'IN_APP';

-- DropForeignKey
ALTER TABLE "ai_conversations" DROP CONSTRAINT IF EXISTS "ai_conversations_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "ai_intent_logs" DROP CONSTRAINT IF EXISTS "ai_intent_logs_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "ai_messages" DROP CONSTRAINT IF EXISTS "ai_messages_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_deposits" DROP CONSTRAINT IF EXISTS "appointment_deposits_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_deposits" DROP CONSTRAINT IF EXISTS "appointment_deposits_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_deposits" DROP CONSTRAINT IF EXISTS "appointment_deposits_confirmedById_fkey";

-- DropForeignKey
ALTER TABLE "appointment_deposits" DROP CONSTRAINT IF EXISTS "appointment_deposits_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_waitlist_entries" DROP CONSTRAINT IF EXISTS "appointment_waitlist_entries_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_waitlist_entries" DROP CONSTRAINT IF EXISTS "appointment_waitlist_entries_clientId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_waitlist_entries" DROP CONSTRAINT IF EXISTS "appointment_waitlist_entries_preferredStaffId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_waitlist_entries" DROP CONSTRAINT IF EXISTS "appointment_waitlist_entries_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_waitlist_offers" DROP CONSTRAINT IF EXISTS "appointment_waitlist_offers_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_waitlist_offers" DROP CONSTRAINT IF EXISTS "appointment_waitlist_offers_entryId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_waitlist_offers" DROP CONSTRAINT IF EXISTS "appointment_waitlist_offers_staffId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_visitId_fkey";

-- DropForeignKey
ALTER TABLE "barbershops" DROP CONSTRAINT IF EXISTS "barbershops_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "care_instruction_templates" DROP CONSTRAINT IF EXISTS "care_instruction_templates_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "care_instruction_templates" DROP CONSTRAINT IF EXISTS "care_instruction_templates_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_identityId_fkey";

-- DropForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_sentById_fkey";

-- DropForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_templateId_fkey";

-- DropForeignKey
ALTER TABLE "client_otp_challenges" DROP CONSTRAINT IF EXISTS "client_otp_challenges_identityId_fkey";

-- DropForeignKey
ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_recurring_packages_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_recurring_packages_clientId_fkey";

-- DropForeignKey
ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_recurring_packages_planId_fkey";

-- DropForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_confirmedById_fkey";

-- DropForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_identityId_fkey";

-- DropForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_rejectedById_fkey";

-- DropForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_salonClientId_fkey";

-- DropForeignKey
ALTER TABLE "client_sessions" DROP CONSTRAINT IF EXISTS "client_sessions_identityId_fkey";

-- DropForeignKey
ALTER TABLE "combo_items" DROP CONSTRAINT IF EXISTS "combo_items_comboId_fkey";

-- DropForeignKey
ALTER TABLE "combo_items" DROP CONSTRAINT IF EXISTS "combo_items_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "combo_items" DROP CONSTRAINT IF EXISTS "combo_items_variationId_fkey";

-- DropForeignKey
ALTER TABLE "copilot_suggestions" DROP CONSTRAINT IF EXISTS "copilot_suggestions_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "corporate_subscriptions" DROP CONSTRAINT IF EXISTS "corporate_subscriptions_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "corporate_subscriptions" DROP CONSTRAINT IF EXISTS "corporate_subscriptions_planId_fkey";

-- DropForeignKey
ALTER TABLE "custom_forms" DROP CONSTRAINT IF EXISTS "custom_forms_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "digital_wallets" DROP CONSTRAINT IF EXISTS "digital_wallets_identityId_fkey";

-- DropForeignKey
ALTER TABLE "equipment" DROP CONSTRAINT IF EXISTS "equipment_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "equipment_movements" DROP CONSTRAINT IF EXISTS "equipment_movements_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "equipment_movements" DROP CONSTRAINT IF EXISTS "equipment_movements_equipmentId_fkey";

-- DropForeignKey
ALTER TABLE "equipment_movements" DROP CONSTRAINT IF EXISTS "equipment_movements_staffId_fkey";

-- DropForeignKey
ALTER TABLE "equipment_needs" DROP CONSTRAINT IF EXISTS "equipment_needs_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "equipment_needs" DROP CONSTRAINT IF EXISTS "equipment_needs_equipmentId_fkey";

-- DropForeignKey
ALTER TABLE "equipment_needs" DROP CONSTRAINT IF EXISTS "equipment_needs_requestedBy_fkey";

-- DropForeignKey
ALTER TABLE "fiscal_configs" DROP CONSTRAINT IF EXISTS "fiscal_configs_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "form_fields" DROP CONSTRAINT IF EXISTS "form_fields_formId_fkey";

-- DropForeignKey
ALTER TABLE "form_responses" DROP CONSTRAINT IF EXISTS "form_responses_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "form_responses" DROP CONSTRAINT IF EXISTS "form_responses_clientId_fkey";

-- DropForeignKey
ALTER TABLE "form_responses" DROP CONSTRAINT IF EXISTS "form_responses_formId_fkey";

-- DropForeignKey
ALTER TABLE "integration_sync_logs" DROP CONSTRAINT IF EXISTS "integration_sync_logs_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "integrations_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_planId_fkey";

-- DropForeignKey
ALTER TABLE "nfe_records" DROP CONSTRAINT IF EXISTS "nfe_records_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "nfe_records" DROP CONSTRAINT IF EXISTS "nfe_records_configId_fkey";

-- DropForeignKey
ALTER TABLE "organization_members" DROP CONSTRAINT IF EXISTS "organization_members_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "organization_members" DROP CONSTRAINT IF EXISTS "organization_members_userId_fkey";

-- DropForeignKey
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "pricing_rules" DROP CONSTRAINT IF EXISTS "pricing_rules_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "profit_entries" DROP CONSTRAINT IF EXISTS "profit_entries_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "profit_settings" DROP CONSTRAINT IF EXISTS "profit_settings_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "purchase_order_items_orderId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_createdById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "quality_audits" DROP CONSTRAINT IF EXISTS "quality_audits_auditedById_fkey";

-- DropForeignKey
ALTER TABLE "quality_audits" DROP CONSTRAINT IF EXISTS "quality_audits_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "quality_audits" DROP CONSTRAINT IF EXISTS "quality_audits_protocolId_fkey";

-- DropForeignKey
ALTER TABLE "quality_protocols" DROP CONSTRAINT IF EXISTS "quality_protocols_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "recurring_package_benefits" DROP CONSTRAINT IF EXISTS "membership_benefits_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "recurring_package_benefits" DROP CONSTRAINT IF EXISTS "recurring_package_benefits_planId_fkey";

-- DropForeignKey
ALTER TABLE "recurring_package_cycles" DROP CONSTRAINT IF EXISTS "recurring_package_cycles_packageId_fkey";

-- DropForeignKey
ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "recurring_package_usages_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "recurring_package_usages_benefitId_fkey";

-- DropForeignKey
ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "recurring_package_usages_packageId_fkey";

-- DropForeignKey
ALTER TABLE "review_responses" DROP CONSTRAINT IF EXISTS "review_responses_respondedById_fkey";

-- DropForeignKey
ALTER TABLE "review_responses" DROP CONSTRAINT IF EXISTS "review_responses_reviewId_fkey";

-- DropForeignKey
ALTER TABLE "salon_clients" DROP CONSTRAINT IF EXISTS "salon_clients_clientIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "salon_recurring_package_plans" DROP CONSTRAINT IF EXISTS "salon_membership_plans_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "salon_reputation" DROP CONSTRAINT IF EXISTS "salon_reputation_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_exceptions" DROP CONSTRAINT IF EXISTS "schedule_exceptions_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "service_addons" DROP CONSTRAINT IF EXISTS "service_addons_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "service_combos" DROP CONSTRAINT IF EXISTS "service_combos_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "service_variations" DROP CONSTRAINT IF EXISTS "service_variations_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_authorizedById_fkey";

-- DropForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_postId_fkey";

-- DropForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_staffId_fkey";

-- DropForeignKey
ALTER TABLE "showcase_events" DROP CONSTRAINT IF EXISTS "showcase_events_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "showcase_events" DROP CONSTRAINT IF EXISTS "showcase_events_entryId_fkey";

-- DropForeignKey
ALTER TABLE "staff_schedules" DROP CONSTRAINT IF EXISTS "staff_schedules_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "staff_schedules" DROP CONSTRAINT IF EXISTS "staff_schedules_staffId_fkey";

-- DropForeignKey
ALTER TABLE "staff_services" DROP CONSTRAINT IF EXISTS "staff_services_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "staff_services" DROP CONSTRAINT IF EXISTS "staff_services_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "staff_services" DROP CONSTRAINT IF EXISTS "staff_services_staffId_fkey";

-- DropForeignKey
ALTER TABLE "staff_time_off" DROP CONSTRAINT IF EXISTS "staff_time_off_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "staff_time_off" DROP CONSTRAINT IF EXISTS "staff_time_off_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "staff_time_off" DROP CONSTRAINT IF EXISTS "staff_time_off_staffId_fkey";

-- DropForeignKey
ALTER TABLE "tab_items" DROP CONSTRAINT IF EXISTS "tab_items_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "tab_items" DROP CONSTRAINT IF EXISTS "tab_items_tabId_fkey";

-- DropForeignKey
ALTER TABLE "tab_payments" DROP CONSTRAINT IF EXISTS "tab_payments_tabId_fkey";

-- DropForeignKey
ALTER TABLE "visit_tabs" DROP CONSTRAINT IF EXISTS "visit_tabs_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "visit_tabs" DROP CONSTRAINT IF EXISTS "visit_tabs_closedById_fkey";

-- DropForeignKey
ALTER TABLE "visit_tabs" DROP CONSTRAINT IF EXISTS "visit_tabs_visitId_fkey";

-- DropForeignKey
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_clientId_fkey";

-- DropForeignKey
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_clientIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "voucher_usages" DROP CONSTRAINT IF EXISTS "voucher_usages_clientId_fkey";

-- DropForeignKey
ALTER TABLE "voucher_usages" DROP CONSTRAINT IF EXISTS "voucher_usages_voucherId_fkey";

-- DropForeignKey
ALTER TABLE "vouchers" DROP CONSTRAINT IF EXISTS "vouchers_barbershopId_fkey";

-- DropForeignKey
ALTER TABLE "wallet_entries" DROP CONSTRAINT IF EXISTS "wallet_entries_walletId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "barbershops_organizationId_idx";

-- DropIndex
DROP INDEX IF EXISTS "client_salon_links_identityId_idx";

-- AlterTable
ALTER TABLE "account_deletion_requests" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "activation_metrics" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ai_conversations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "lastMessageAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "endedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ai_intent_logs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "loggedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ai_messages" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "sentAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "appointment_deposits" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "confirmedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable

-- AlterTable
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "validUntil" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "appointment_waitlist_offers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "respondedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "appointments"
ALTER COLUMN "depositExpiry" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "noShowMarkedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "barbershop_onboardings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "barbershops" ALTER COLUMN "onboardingCompletedSteps" DROP DEFAULT;

-- AlterTable
ALTER TABLE "care_instruction_templates" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "cash_movements" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "client_care_instructions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "sentAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "readAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "client_identities" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "client_otp_challenges" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "verifiedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "client_procedure_records" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"client_recurring_packages"'::regclass AND conname = 'client_memberships_pkey') THEN
    ALTER TABLE "client_recurring_packages" RENAME CONSTRAINT "client_memberships_pkey" TO "client_recurring_packages_pkey";
  END IF;
END $$;
ALTER TABLE "client_recurring_packages"
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "cancelDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "pauseDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "resumeDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "client_salon_links" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "requestedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "confirmedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "rejectedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "revocationAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "client_sessions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "revokedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "combo_items" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "commission_entries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "copilot_suggestions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "corporate_plans" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "corporate_subscriptions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "crm_backfill_runs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "crm_campaign_recipients" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "crm_campaigns" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "crm_financial_events" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "grossAmount" SET DATA TYPE REAL,
ALTER COLUMN "receivedAmount" SET DATA TYPE REAL,
ALTER COLUMN "outstandingDelta" SET DATA TYPE REAL;

-- AlterTable
ALTER TABLE "cron_runs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "jobName" SET DATA TYPE TEXT,
ALTER COLUMN "scheduledKey" SET DATA TYPE TEXT,
ALTER COLUMN "status" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "custom_forms" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "daily_closeouts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "daily_weather_logs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "conditionText" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "digital_wallets" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "dismissed_recommendations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "equipment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "equipment_movements" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "equipment_needs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "financial_correction_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "fiscal_configs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "form_fields" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "form_responses" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "submittedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "idempotency_records" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "status" SET DATA TYPE TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "integration_sync_logs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "completedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "integrations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "lastSyncAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "internal_invitations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "loyalty_accounts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "loyalty_ledger_entries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "loyalty_programs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "nfe_records" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "issuedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "canceledAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notification_attempts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_deliveries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_outbox" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_preferences" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_provider_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_suppressions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organization_members" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "invitedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "acceptedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pricing_rules" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "startAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "endAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "professional_goals" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "profit_entries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "computedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profit_settings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "purchase_order_items" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_orders" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "expectedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "receivedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "quality_audits" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "auditedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "quality_protocols" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"recurring_package_benefits"'::regclass AND conname = 'membership_benefits_pkey') THEN
    ALTER TABLE "recurring_package_benefits" RENAME CONSTRAINT "membership_benefits_pkey" TO "recurring_package_benefits_pkey";
  END IF;
END $$;
ALTER TABLE "recurring_package_benefits"
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"recurring_package_cycles"'::regclass AND conname = 'membership_cycles_pkey') THEN
    ALTER TABLE "recurring_package_cycles" RENAME CONSTRAINT "membership_cycles_pkey" TO "recurring_package_cycles_pkey";
  END IF;
END $$;
ALTER TABLE "recurring_package_cycles"
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "paidAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"recurring_package_usages"'::regclass AND conname = 'membership_usages_pkey') THEN
    ALTER TABLE "recurring_package_usages" RENAME CONSTRAINT "membership_usages_pkey" TO "recurring_package_usages_pkey";
  END IF;
END $$;
ALTER TABLE "recurring_package_usages"
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "review_responses" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "respondedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "salon_clients" ALTER COLUMN "whatsapp" SET DEFAULT '',
ALTER COLUMN "riskRestrictionUntil" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"salon_recurring_package_plans"'::regclass AND conname = 'salon_membership_plans_pkey') THEN
    ALTER TABLE "salon_recurring_package_plans" RENAME CONSTRAINT "salon_membership_plans_pkey" TO "salon_recurring_package_plans_pkey";
  END IF;
END $$;
ALTER TABLE "salon_recurring_package_plans"
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "salon_reputation" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "computedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_addons" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_combos" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_variations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "showcase_entries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "authorizedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "publishedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "hiddenAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "showcase_events" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "staff_schedules" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "staff_services" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "staff_time_off" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tab_items" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tab_payments" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "recordedById" SET DATA TYPE TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "task_comments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "task_history" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ticket_comments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ticket_history" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tickets" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "visit_tabs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "closedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "visits" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "voucher_usages" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vouchers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "startAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "endAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "wallet_entries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- DropTable
DROP TABLE IF EXISTS "schedule_exceptions";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointment_deposits_barbershopId_status_idx" ON "appointment_deposits"("barbershopId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointment_deposits_barbershopId_status_expiresAt_idx" ON "appointment_deposits"("barbershopId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointment_waitlist_entries_barbershopId_status_idx" ON "appointment_waitlist_entries"("barbershopId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointment_waitlist_entries_barbershopId_status_serviceId_idx" ON "appointment_waitlist_entries"("barbershopId", "status", "serviceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointment_waitlist_offers_token_idx" ON "appointment_waitlist_offers"("token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "barbershop_email_settings_barbershopId_key" ON "barbershop_email_settings"("barbershopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inventory_receipt_items_barbershopId_idx" ON "inventory_receipt_items"("barbershopId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "queue_appointmentId_key" ON "queue"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_refereeBarbershopId_key" ON "referrals"("refereeBarbershopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "refunds_paymentId_idx" ON "refunds"("paymentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "refunds_barbershopId_idx" ON "refunds"("barbershopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "retail_sale_lines_barbershopId_idx" ON "retail_sale_lines"("barbershopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "retail_sale_refund_lines_barbershopId_idx" ON "retail_sale_refund_lines"("barbershopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "salon_clients_barbershopId_idx" ON "salon_clients"("barbershopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "salon_clients_whatsapp_idx" ON "salon_clients"("whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "schedules_barbershopId_dayOfWeek_key" ON "schedules"("barbershopId", "dayOfWeek");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_categories_barbershopId_idx" ON "service_categories"("barbershopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_categories_active_idx" ON "service_categories"("active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_packages_barbershopId_idx" ON "service_packages"("barbershopId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_packages_serviceId_idx" ON "service_packages"("serviceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_packages_active_idx" ON "service_packages"("active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_barbershopId_status_idx" ON "subscriptions"("barbershopId", "status");

-- CreateIndex
-- Dedupe users.cpf (unicidade exigida pelo schema): manter a conta
-- não-teste (e, em empate, a mais recente) e anular as demais.
UPDATE "users" u SET "cpf" = NULL
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "cpf" ORDER BY (lower("name") ~ 'test|demo|exemplo') ASC, "createdAt" DESC, "id" DESC) AS rn FROM "users" WHERE "cpf" IS NOT NULL) d
WHERE u."id" = d."id" AND d.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_googleSub_key" ON "users"("googleSub");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_cpf_idx" ON "users"("cpf");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "verification_tokens_token_idx" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "verification_tokens_userId_idx" ON "verification_tokens"("userId");

-- AddForeignKey
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_barbershopId_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_userId_fkey";
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" DROP CONSTRAINT IF EXISTS "verification_tokens_userId_fkey";
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_barbershopId_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbershops" DROP CONSTRAINT IF EXISTS "barbershops_referredByCodeId_fkey";
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_referredByCodeId_fkey" FOREIGN KEY ("referredByCodeId") REFERENCES "referral_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbershops" DROP CONSTRAINT IF EXISTS "barbershops_organizationId_fkey";
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" DROP CONSTRAINT IF EXISTS "schedules_barbershopId_fkey";
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_barbershopId_fkey";
ALTER TABLE "services" ADD CONSTRAINT "services_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_categoryId_fkey";
ALTER TABLE "services" ADD CONSTRAINT "services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue" DROP CONSTRAINT IF EXISTS "queue_barbershopId_fkey";
ALTER TABLE "queue" ADD CONSTRAINT "queue_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue" DROP CONSTRAINT IF EXISTS "queue_serviceId_fkey";
ALTER TABLE "queue" ADD CONSTRAINT "queue_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_barbershopId_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_serviceId_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_staffId_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_clientId_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_clientPackageId_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "client_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_visitId_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_clients" DROP CONSTRAINT IF EXISTS "salon_clients_barbershopId_fkey";
ALTER TABLE "salon_clients" ADD CONSTRAINT "salon_clients_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_clients" DROP CONSTRAINT IF EXISTS "salon_clients_clientIdentityId_fkey";
ALTER TABLE "salon_clients" ADD CONSTRAINT "salon_clients_clientIdentityId_fkey" FOREIGN KEY ("clientIdentityId") REFERENCES "client_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_packages" DROP CONSTRAINT IF EXISTS "service_packages_barbershopId_fkey";
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_packages" DROP CONSTRAINT IF EXISTS "service_packages_serviceId_fkey";
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" DROP CONSTRAINT IF EXISTS "client_packages_barbershopId_fkey";
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" DROP CONSTRAINT IF EXISTS "client_packages_clientId_fkey";
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" DROP CONSTRAINT IF EXISTS "client_packages_packageId_fkey";
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "service_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" DROP CONSTRAINT IF EXISTS "client_packages_serviceId_fkey";
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" DROP CONSTRAINT IF EXISTS "client_packages_soldById_fkey";
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_posts" DROP CONSTRAINT IF EXISTS "feed_posts_barbershopId_fkey";
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_posts" DROP CONSTRAINT IF EXISTS "feed_posts_authorId_fkey";
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_barbershopId_fkey";
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_planId_fkey";
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_subscriptionId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_planId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_paymentId_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_barbershopId_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_requestedById_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" DROP CONSTRAINT IF EXISTS "service_categories_barbershopId_fkey";
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" DROP CONSTRAINT IF EXISTS "expense_categories_barbershopId_fkey";
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_barbershopId_fkey";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_categoryId_fkey";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiados" DROP CONSTRAINT IF EXISTS "fiados_barbershopId_fkey";
ALTER TABLE "fiados" ADD CONSTRAINT "fiados_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_payments" DROP CONSTRAINT IF EXISTS "fiado_payments_fiadoId_fkey";
ALTER TABLE "fiado_payments" ADD CONSTRAINT "fiado_payments_fiadoId_fkey" FOREIGN KEY ("fiadoId") REFERENCES "fiados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" DROP CONSTRAINT IF EXISTS "referral_codes_ownerUserId_fkey";
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" DROP CONSTRAINT IF EXISTS "referral_codes_barbershopId_fkey";
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_referralCodeId_fkey";
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "referral_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_referrerUserId_fkey";
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_refereeUserId_fkey";
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_referrerBarbershopId_fkey";
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerBarbershopId_fkey" FOREIGN KEY ("referrerBarbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_refereeBarbershopId_fkey";
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeBarbershopId_fkey" FOREIGN KEY ("refereeBarbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_deposits" DROP CONSTRAINT IF EXISTS "appointment_deposits_barbershopId_fkey";
ALTER TABLE "appointment_deposits" ADD CONSTRAINT "appointment_deposits_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_deposits" DROP CONSTRAINT IF EXISTS "appointment_deposits_appointmentId_fkey";
ALTER TABLE "appointment_deposits" ADD CONSTRAINT "appointment_deposits_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_deposits" DROP CONSTRAINT IF EXISTS "appointment_deposits_serviceId_fkey";
ALTER TABLE "appointment_deposits" ADD CONSTRAINT "appointment_deposits_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_deposits" DROP CONSTRAINT IF EXISTS "appointment_deposits_confirmedById_fkey";
ALTER TABLE "appointment_deposits" ADD CONSTRAINT "appointment_deposits_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist_entries" DROP CONSTRAINT IF EXISTS "appointment_waitlist_entries_barbershopId_fkey";
ALTER TABLE "appointment_waitlist_entries" ADD CONSTRAINT "appointment_waitlist_entries_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist_entries" DROP CONSTRAINT IF EXISTS "appointment_waitlist_entries_clientId_fkey";
ALTER TABLE "appointment_waitlist_entries" ADD CONSTRAINT "appointment_waitlist_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist_entries" DROP CONSTRAINT IF EXISTS "appointment_waitlist_entries_serviceId_fkey";
ALTER TABLE "appointment_waitlist_entries" ADD CONSTRAINT "appointment_waitlist_entries_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist_entries" DROP CONSTRAINT IF EXISTS "appointment_waitlist_entries_preferredStaffId_fkey";
ALTER TABLE "appointment_waitlist_entries" ADD CONSTRAINT "appointment_waitlist_entries_preferredStaffId_fkey" FOREIGN KEY ("preferredStaffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist_offers" DROP CONSTRAINT IF EXISTS "appointment_waitlist_offers_entryId_fkey";
ALTER TABLE "appointment_waitlist_offers" ADD CONSTRAINT "appointment_waitlist_offers_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "appointment_waitlist_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist_offers" DROP CONSTRAINT IF EXISTS "appointment_waitlist_offers_barbershopId_fkey";
ALTER TABLE "appointment_waitlist_offers" ADD CONSTRAINT "appointment_waitlist_offers_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist_offers" DROP CONSTRAINT IF EXISTS "appointment_waitlist_offers_staffId_fkey";
ALTER TABLE "appointment_waitlist_offers" ADD CONSTRAINT "appointment_waitlist_offers_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist_offers" DROP CONSTRAINT IF EXISTS "appointment_waitlist_offers_appointmentId_fkey";
ALTER TABLE "appointment_waitlist_offers" ADD CONSTRAINT "appointment_waitlist_offers_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_recurring_package_plans" DROP CONSTRAINT IF EXISTS "salon_recurring_package_plans_barbershopId_fkey";
ALTER TABLE "salon_recurring_package_plans" ADD CONSTRAINT "salon_recurring_package_plans_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_package_benefits" DROP CONSTRAINT IF EXISTS "recurring_package_benefits_planId_fkey";
ALTER TABLE "recurring_package_benefits" ADD CONSTRAINT "recurring_package_benefits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "salon_recurring_package_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_package_benefits" DROP CONSTRAINT IF EXISTS "recurring_package_benefits_serviceId_fkey";
ALTER TABLE "recurring_package_benefits" ADD CONSTRAINT "recurring_package_benefits_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_recurring_packages_barbershopId_fkey";
ALTER TABLE "client_recurring_packages" ADD CONSTRAINT "client_recurring_packages_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_recurring_packages_planId_fkey";
ALTER TABLE "client_recurring_packages" ADD CONSTRAINT "client_recurring_packages_planId_fkey" FOREIGN KEY ("planId") REFERENCES "salon_recurring_package_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_recurring_packages" DROP CONSTRAINT IF EXISTS "client_recurring_packages_clientId_fkey";
ALTER TABLE "client_recurring_packages" ADD CONSTRAINT "client_recurring_packages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_package_cycles" DROP CONSTRAINT IF EXISTS "recurring_package_cycles_packageId_fkey";
ALTER TABLE "recurring_package_cycles" ADD CONSTRAINT "recurring_package_cycles_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "client_recurring_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "recurring_package_usages_packageId_fkey";
ALTER TABLE "recurring_package_usages" ADD CONSTRAINT "recurring_package_usages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "client_recurring_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "recurring_package_usages_benefitId_fkey";
ALTER TABLE "recurring_package_usages" ADD CONSTRAINT "recurring_package_usages_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "recurring_package_benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_package_usages" DROP CONSTRAINT IF EXISTS "recurring_package_usages_appointmentId_fkey";
ALTER TABLE "recurring_package_usages" ADD CONSTRAINT "recurring_package_usages_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_barbershopId_fkey";
ALTER TABLE "showcase_entries" ADD CONSTRAINT "showcase_entries_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_postId_fkey";
ALTER TABLE "showcase_entries" ADD CONSTRAINT "showcase_entries_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_serviceId_fkey";
ALTER TABLE "showcase_entries" ADD CONSTRAINT "showcase_entries_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_staffId_fkey";
ALTER TABLE "showcase_entries" ADD CONSTRAINT "showcase_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_entries" DROP CONSTRAINT IF EXISTS "showcase_entries_authorizedById_fkey";
ALTER TABLE "showcase_entries" ADD CONSTRAINT "showcase_entries_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_events" DROP CONSTRAINT IF EXISTS "showcase_events_entryId_fkey";
ALTER TABLE "showcase_events" ADD CONSTRAINT "showcase_events_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "showcase_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_events" DROP CONSTRAINT IF EXISTS "showcase_events_barbershopId_fkey";
ALTER TABLE "showcase_events" ADD CONSTRAINT "showcase_events_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_variations" DROP CONSTRAINT IF EXISTS "service_variations_serviceId_fkey";
ALTER TABLE "service_variations" ADD CONSTRAINT "service_variations_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_addons" DROP CONSTRAINT IF EXISTS "service_addons_serviceId_fkey";
ALTER TABLE "service_addons" ADD CONSTRAINT "service_addons_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_combos" DROP CONSTRAINT IF EXISTS "service_combos_barbershopId_fkey";
ALTER TABLE "service_combos" ADD CONSTRAINT "service_combos_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" DROP CONSTRAINT IF EXISTS "combo_items_comboId_fkey";
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "service_combos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" DROP CONSTRAINT IF EXISTS "combo_items_serviceId_fkey";
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" DROP CONSTRAINT IF EXISTS "combo_items_variationId_fkey";
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "service_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_barbershopId_fkey";
ALTER TABLE "visits" ADD CONSTRAINT "visits_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_clientId_fkey";
ALTER TABLE "visits" ADD CONSTRAINT "visits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_tabs" DROP CONSTRAINT IF EXISTS "visit_tabs_visitId_fkey";
ALTER TABLE "visit_tabs" ADD CONSTRAINT "visit_tabs_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_tabs" DROP CONSTRAINT IF EXISTS "visit_tabs_barbershopId_fkey";
ALTER TABLE "visit_tabs" ADD CONSTRAINT "visit_tabs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_tabs" DROP CONSTRAINT IF EXISTS "visit_tabs_closedById_fkey";
ALTER TABLE "visit_tabs" ADD CONSTRAINT "visit_tabs_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tab_items" DROP CONSTRAINT IF EXISTS "tab_items_tabId_fkey";
ALTER TABLE "tab_items" ADD CONSTRAINT "tab_items_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "visit_tabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tab_items" DROP CONSTRAINT IF EXISTS "tab_items_appointmentId_fkey";
ALTER TABLE "tab_items" ADD CONSTRAINT "tab_items_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tab_payments" DROP CONSTRAINT IF EXISTS "tab_payments_tabId_fkey";
ALTER TABLE "tab_payments" ADD CONSTRAINT "tab_payments_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "visit_tabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_sessions" DROP CONSTRAINT IF EXISTS "client_sessions_identityId_fkey";
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "client_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_otp_challenges" DROP CONSTRAINT IF EXISTS "client_otp_challenges_identityId_fkey";
ALTER TABLE "client_otp_challenges" ADD CONSTRAINT "client_otp_challenges_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "client_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_identityId_fkey";
ALTER TABLE "client_salon_links" ADD CONSTRAINT "client_salon_links_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "client_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_barbershopId_fkey";
ALTER TABLE "client_salon_links" ADD CONSTRAINT "client_salon_links_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_salonClientId_fkey";
ALTER TABLE "client_salon_links" ADD CONSTRAINT "client_salon_links_salonClientId_fkey" FOREIGN KEY ("salonClientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_confirmedById_fkey";
ALTER TABLE "client_salon_links" ADD CONSTRAINT "client_salon_links_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_salon_links" DROP CONSTRAINT IF EXISTS "client_salon_links_rejectedById_fkey";
ALTER TABLE "client_salon_links" ADD CONSTRAINT "client_salon_links_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_instruction_templates" DROP CONSTRAINT IF EXISTS "care_instruction_templates_barbershopId_fkey";
ALTER TABLE "care_instruction_templates" ADD CONSTRAINT "care_instruction_templates_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_instruction_templates" DROP CONSTRAINT IF EXISTS "care_instruction_templates_serviceId_fkey";
ALTER TABLE "care_instruction_templates" ADD CONSTRAINT "care_instruction_templates_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_barbershopId_fkey";
ALTER TABLE "client_care_instructions" ADD CONSTRAINT "client_care_instructions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_identityId_fkey";
ALTER TABLE "client_care_instructions" ADD CONSTRAINT "client_care_instructions_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "client_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_appointmentId_fkey";
ALTER TABLE "client_care_instructions" ADD CONSTRAINT "client_care_instructions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_templateId_fkey";
ALTER TABLE "client_care_instructions" ADD CONSTRAINT "client_care_instructions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "care_instruction_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_care_instructions" DROP CONSTRAINT IF EXISTS "client_care_instructions_sentById_fkey";
ALTER TABLE "client_care_instructions" ADD CONSTRAINT "client_care_instructions_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_entries" DROP CONSTRAINT IF EXISTS "profit_entries_barbershopId_fkey";
ALTER TABLE "profit_entries" ADD CONSTRAINT "profit_entries_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_settings" DROP CONSTRAINT IF EXISTS "profit_settings_barbershopId_fkey";
ALTER TABLE "profit_settings" ADD CONSTRAINT "profit_settings_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" DROP CONSTRAINT IF EXISTS "equipment_barbershopId_fkey";
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_movements" DROP CONSTRAINT IF EXISTS "equipment_movements_barbershopId_fkey";
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_movements" DROP CONSTRAINT IF EXISTS "equipment_movements_equipmentId_fkey";
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_movements" DROP CONSTRAINT IF EXISTS "equipment_movements_staffId_fkey";
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_needs" DROP CONSTRAINT IF EXISTS "equipment_needs_barbershopId_fkey";
ALTER TABLE "equipment_needs" ADD CONSTRAINT "equipment_needs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_needs" DROP CONSTRAINT IF EXISTS "equipment_needs_equipmentId_fkey";
ALTER TABLE "equipment_needs" ADD CONSTRAINT "equipment_needs_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_needs" DROP CONSTRAINT IF EXISTS "equipment_needs_requestedBy_fkey";
ALTER TABLE "equipment_needs" ADD CONSTRAINT "equipment_needs_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_ownerId_fkey";
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" DROP CONSTRAINT IF EXISTS "organization_members_organizationId_fkey";
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" DROP CONSTRAINT IF EXISTS "organization_members_userId_fkey";
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_forms" DROP CONSTRAINT IF EXISTS "custom_forms_barbershopId_fkey";
ALTER TABLE "custom_forms" ADD CONSTRAINT "custom_forms_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_fields" DROP CONSTRAINT IF EXISTS "form_fields_formId_fkey";
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_formId_fkey" FOREIGN KEY ("formId") REFERENCES "custom_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" DROP CONSTRAINT IF EXISTS "form_responses_formId_fkey";
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_formId_fkey" FOREIGN KEY ("formId") REFERENCES "custom_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" DROP CONSTRAINT IF EXISTS "form_responses_barbershopId_fkey";
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" DROP CONSTRAINT IF EXISTS "form_responses_clientId_fkey";
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" DROP CONSTRAINT IF EXISTS "staff_schedules_barbershopId_fkey";
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" DROP CONSTRAINT IF EXISTS "staff_schedules_staffId_fkey";
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" DROP CONSTRAINT IF EXISTS "staff_services_barbershopId_fkey";
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" DROP CONSTRAINT IF EXISTS "staff_services_staffId_fkey";
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" DROP CONSTRAINT IF EXISTS "staff_services_serviceId_fkey";
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" DROP CONSTRAINT IF EXISTS "staff_time_off_barbershopId_fkey";
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" DROP CONSTRAINT IF EXISTS "staff_time_off_staffId_fkey";
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" DROP CONSTRAINT IF EXISTS "staff_time_off_approvedById_fkey";
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" DROP CONSTRAINT IF EXISTS "pricing_rules_barbershopId_fkey";
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" DROP CONSTRAINT IF EXISTS "vouchers_barbershopId_fkey";
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" DROP CONSTRAINT IF EXISTS "voucher_usages_voucherId_fkey";
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" DROP CONSTRAINT IF EXISTS "voucher_usages_clientId_fkey";
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_reputation" DROP CONSTRAINT IF EXISTS "salon_reputation_barbershopId_fkey";
ALTER TABLE "salon_reputation" ADD CONSTRAINT "salon_reputation_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_responses" DROP CONSTRAINT IF EXISTS "review_responses_reviewId_fkey";
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "client_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_responses" DROP CONSTRAINT IF EXISTS "review_responses_respondedById_fkey";
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_wallets" DROP CONSTRAINT IF EXISTS "digital_wallets_identityId_fkey";
ALTER TABLE "digital_wallets" ADD CONSTRAINT "digital_wallets_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "client_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" DROP CONSTRAINT IF EXISTS "wallet_entries_walletId_fkey";
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "digital_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_protocols" DROP CONSTRAINT IF EXISTS "quality_protocols_barbershopId_fkey";
ALTER TABLE "quality_protocols" ADD CONSTRAINT "quality_protocols_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audits" DROP CONSTRAINT IF EXISTS "quality_audits_protocolId_fkey";
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "quality_protocols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audits" DROP CONSTRAINT IF EXISTS "quality_audits_barbershopId_fkey";
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audits" DROP CONSTRAINT IF EXISTS "quality_audits_auditedById_fkey";
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_auditedById_fkey" FOREIGN KEY ("auditedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_barbershopId_fkey";
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_supplierId_fkey";
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_createdById_fkey";
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "purchase_order_items_orderId_fkey";
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_suggestions" DROP CONSTRAINT IF EXISTS "copilot_suggestions_barbershopId_fkey";
ALTER TABLE "copilot_suggestions" ADD CONSTRAINT "copilot_suggestions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_subscriptions" DROP CONSTRAINT IF EXISTS "corporate_subscriptions_planId_fkey";
ALTER TABLE "corporate_subscriptions" ADD CONSTRAINT "corporate_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "corporate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_subscriptions" DROP CONSTRAINT IF EXISTS "corporate_subscriptions_barbershopId_fkey";
ALTER TABLE "corporate_subscriptions" ADD CONSTRAINT "corporate_subscriptions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" DROP CONSTRAINT IF EXISTS "ai_conversations_barbershopId_fkey";
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" DROP CONSTRAINT IF EXISTS "ai_messages_conversationId_fkey";
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_intent_logs" DROP CONSTRAINT IF EXISTS "ai_intent_logs_barbershopId_fkey";
ALTER TABLE "ai_intent_logs" ADD CONSTRAINT "ai_intent_logs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_configs" DROP CONSTRAINT IF EXISTS "fiscal_configs_barbershopId_fkey";
ALTER TABLE "fiscal_configs" ADD CONSTRAINT "fiscal_configs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_records" DROP CONSTRAINT IF EXISTS "nfe_records_barbershopId_fkey";
ALTER TABLE "nfe_records" ADD CONSTRAINT "nfe_records_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_records" DROP CONSTRAINT IF EXISTS "nfe_records_configId_fkey";
ALTER TABLE "nfe_records" ADD CONSTRAINT "nfe_records_configId_fkey" FOREIGN KEY ("configId") REFERENCES "fiscal_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "integrations_barbershopId_fkey";
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_logs" DROP CONSTRAINT IF EXISTS "integration_sync_logs_integrationId_fkey";
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'client_memberships_barbershopId_status_idx' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "client_memberships_barbershopId_status_idx" RENAME TO "client_recurring_packages_barbershopId_status_idx";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'client_memberships_clientId_idx' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "client_memberships_clientId_idx" RENAME TO "client_recurring_packages_clientId_idx";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'crm_financial_events_source_unique' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "crm_financial_events_source_unique" RENAME TO "crm_financial_events_barbershopId_sourceType_sourceId_kind_key";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'idempotency_records_scope_key_key' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "idempotency_records_scope_key_key" RENAME TO "idempotency_records_scope_idempotencyKey_key";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'professional_goals_barbershopId_professionalId_metric_startDate' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "professional_goals_barbershopId_professionalId_metric_startDate" RENAME TO "professional_goals_barbershopId_professionalId_metric_start_key";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'membership_benefits_planId_idx' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "membership_benefits_planId_idx" RENAME TO "recurring_package_benefits_planId_idx";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'membership_cycles_idempotencyKey_key' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "membership_cycles_idempotencyKey_key" RENAME TO "recurring_package_cycles_idempotencyKey_key";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'membership_cycles_status_dueDate_idx' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "membership_cycles_status_dueDate_idx" RENAME TO "recurring_package_cycles_status_dueDate_idx";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'membership_usages_idempotencyKey_key' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "membership_usages_idempotencyKey_key" RENAME TO "recurring_package_usages_idempotencyKey_key";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'salon_email_preferences_user_shop_category_key' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "salon_email_preferences_user_shop_category_key" RENAME TO "salon_email_preferences_userId_barbershopId_category_key";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind IN ('i','u') AND relname = 'salon_membership_plans_barbershopId_isActive_idx' AND relnamespace = 'public'::regnamespace) THEN
    ALTER INDEX "salon_membership_plans_barbershopId_isActive_idx" RENAME TO "salon_recurring_package_plans_barbershopId_isActive_idx";
  END IF;
END $$;


-- Conversões text -> enum (substituem DROP+ADD COLUMN destrutivo)
-- NOT NULL/DEFAULT reafirmados apenas onde o ADD original os definia.
ALTER TABLE "appointment_deposits" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "appointment_deposits" ALTER COLUMN "status" TYPE "DepositStatus" USING COALESCE("status", 'PENDING')::"DepositStatus";
ALTER TABLE "appointment_deposits" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "appointment_deposits" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "appointment_deposits" ALTER COLUMN "refundRule" DROP DEFAULT;
ALTER TABLE "appointment_deposits" ALTER COLUMN "refundRule" TYPE "RefundRule" USING COALESCE("refundRule", 'FULL_REFUND')::"RefundRule";
ALTER TABLE "appointment_deposits" ALTER COLUMN "refundRule" SET DEFAULT 'FULL_REFUND';
ALTER TABLE "appointment_deposits" ALTER COLUMN "refundRule" SET NOT NULL;
ALTER TABLE "appointment_policies" ALTER COLUMN "depositRequired" DROP DEFAULT;
ALTER TABLE "appointment_policies" ALTER COLUMN "depositRequired" TYPE "DepositRequiredMode" USING COALESCE("depositRequired", 'OFF')::"DepositRequiredMode";
ALTER TABLE "appointment_policies" ALTER COLUMN "depositRequired" SET DEFAULT 'OFF';
ALTER TABLE "appointment_policies" ALTER COLUMN "depositRequired" SET NOT NULL;
ALTER TABLE "appointment_policies" ALTER COLUMN "depositRefundRule" DROP DEFAULT;
ALTER TABLE "appointment_policies" ALTER COLUMN "depositRefundRule" TYPE "RefundRule" USING COALESCE("depositRefundRule", 'FULL_REFUND')::"RefundRule";
ALTER TABLE "appointment_policies" ALTER COLUMN "depositRefundRule" SET DEFAULT 'FULL_REFUND';
ALTER TABLE "appointment_policies" ALTER COLUMN "depositRefundRule" SET NOT NULL;
ALTER TABLE "appointment_policies" ALTER COLUMN "noShowDepositRule" DROP DEFAULT;
ALTER TABLE "appointment_policies" ALTER COLUMN "noShowDepositRule" TYPE "RefundRule" USING COALESCE("noShowDepositRule", 'NO_REFUND')::"RefundRule";
ALTER TABLE "appointment_policies" ALTER COLUMN "noShowDepositRule" SET DEFAULT 'NO_REFUND';
ALTER TABLE "appointment_policies" ALTER COLUMN "noShowDepositRule" SET NOT NULL;
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "origin" DROP DEFAULT;
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "origin" TYPE "WaitlistOrigin" USING COALESCE("origin", 'PUBLIC')::"WaitlistOrigin";
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "origin" SET DEFAULT 'PUBLIC';
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "origin" SET NOT NULL;
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "status" TYPE "WaitlistStatus" USING COALESCE("status", 'WAITING')::"WaitlistStatus";
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "status" SET DEFAULT 'WAITING';
ALTER TABLE "appointment_waitlist_entries" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "appointment_waitlist_offers" ALTER COLUMN "response" DROP DEFAULT;
ALTER TABLE "appointment_waitlist_offers" ALTER COLUMN "response" TYPE "WaitlistOfferResponse" USING "response"::"WaitlistOfferResponse";
ALTER TABLE "appointments" ALTER COLUMN "depositStatus" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "depositStatus" TYPE "DepositStatus" USING "depositStatus"::"DepositStatus";
ALTER TABLE "salon_clients" ALTER COLUMN "riskLevel" DROP DEFAULT;
ALTER TABLE "salon_clients" ALTER COLUMN "riskLevel" TYPE "RiskLevel" USING COALESCE("riskLevel", 'NONE')::"RiskLevel";
ALTER TABLE "salon_clients" ALTER COLUMN "riskLevel" SET DEFAULT 'NONE';
ALTER TABLE "salon_clients" ALTER COLUMN "riskLevel" SET NOT NULL;
