-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MASTER_ADMIN', 'OWNER', 'EMPLOYEE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "PaymentMethodEnum" AS ENUM ('credit_card', 'debit_card', 'pix', 'payment_link');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MERCADOPAGO', 'ABACATEPAY', 'ASAAS');

-- CreateEnum
CREATE TYPE "PaymentStatusEnum" AS ENUM ('pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'IN_CHAIR', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PackagePaymentMethod" AS ENUM ('cash', 'pix', 'card', 'other');

-- CreateEnum
CREATE TYPE "ClientPackageStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeedPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PostMode" AS ENUM ('QUEUE', 'APPOINTMENTS', 'BOTH');

-- CreateEnum
CREATE TYPE "FeedType" AS ENUM ('HAIRCUT', 'BEARD', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "PlanBillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BlockedEntityType" AS ENUM ('CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminNotificationType" AS ENUM ('BLOCK_AUTO', 'UNBLOCK_AUTO', 'UNBLOCK_MANUAL', 'SUBSCRIPTION_EXPIRED', 'PAYMENT_RECEIVED', 'PAYMENT_REFUNDED', 'CONTACT_MESSAGE', 'REFERRAL_REVOKED');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('FIXED', 'VARIABLE', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "ExpenseRecurrence" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "FiadoStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'FORGIVEN');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password" VARCHAR(500) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "barbershopId" UUID,
    "cpf" VARCHAR(11),
    "googleSub" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "termsVersion" VARCHAR(20),
    "termsAcceptedAt" TIMESTAMP(3),
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "marketingOptInAt" TIMESTAMP(3),
    "lgpdConsentAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "mpPaymentId" BIGINT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MERCADOPAGO',
    "providerPaymentId" VARCHAR(128),
    "checkoutUrl" VARCHAR(500),
    "status" "PaymentStatusEnum" NOT NULL DEFAULT 'pending',
    "statusDetail" VARCHAR(100) NOT NULL,
    "paymentMethod" "PaymentMethodEnum" NOT NULL,
    "transactionAmount" REAL NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'BRL',
    "description" VARCHAR(256) NOT NULL,
    "barbershopId" UUID NOT NULL,
    "serviceId" UUID,
    "appointmentId" UUID,
    "queueItemId" UUID,
    "externalReference" VARCHAR(128),
    "pixQrCode" TEXT,
    "pixQrCodeBase64" TEXT,
    "pixExpirationDate" TIMESTAMP(3),
    "rawResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barbershops" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "whatsapp" VARCHAR(20) NOT NULL,
    "logoUrl" VARCHAR(500),
    "cnpj" VARCHAR(20),
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "referredByCodeId" UUID,
    "autoPostEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoPostLastDate" TIMESTAMP(3),

    CONSTRAINT "barbershops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "openTime" VARCHAR(5) NOT NULL,
    "closeTime" VARCHAR(5) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "categoryId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "price" REAL NOT NULL,
    "avgTimeMinutes" INTEGER NOT NULL,
    "icon" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "customerName" VARCHAR(200) NOT NULL,
    "whatsapp" VARCHAR(20) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "estimatedStartAt" TIMESTAMP(3),
    "addedByStaff" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" UUID,
    "finalPrice" REAL,

    CONSTRAINT "queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "staffId" UUID,
    "clientId" UUID,
    "clientPackageId" UUID,
    "customerName" VARCHAR(200) NOT NULL,
    "whatsapp" VARCHAR(20) NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_clients" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "whatsapp" VARCHAR(20) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salon_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_packages" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "validityDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_packages" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "remainingSessions" INTEGER NOT NULL,
    "pricePaid" REAL NOT NULL,
    "paymentMethod" "PackagePaymentMethod" NOT NULL,
    "status" "ClientPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "soldById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_posts" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "authorId" UUID,
    "type" "FeedType" NOT NULL,
    "title" VARCHAR(200),
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" "FeedPostStatus" NOT NULL DEFAULT 'DRAFT',
    "postMode" "PostMode" NOT NULL DEFAULT 'BOTH',
    "ctaText" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "billingCycle" "PlanBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "maxEmployees" INTEGER NOT NULL DEFAULT 0,
    "hasDashboard" BOOLEAN NOT NULL DEFAULT true,
    "tierKey" VARCHAR(40) NOT NULL DEFAULT 'pro',
    "features" TEXT[],
    "abacateProductId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "cancelDate" TIMESTAMP(3),
    "cancelReason" VARCHAR(50),
    "referralCreditDays" INTEGER NOT NULL DEFAULT 0,
    "asaasCustomerId" VARCHAR(64),
    "asaasCreditCardToken" VARCHAR(128),
    "cardLast4" VARCHAR(4),
    "cardBrand" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "amount" REAL NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_entities" (
    "id" UUID NOT NULL,
    "type" "BlockedEntityType" NOT NULL,
    "value" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unblockedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "barbershopId" UUID,
    "blockedBy" VARCHAR(50),
    "unblockedBy" VARCHAR(50),
    "externalRef" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL,
    "providerRefundId" VARCHAR(128),
    "requestedById" UUID,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notifications" (
    "id" UUID NOT NULL,
    "type" "AdminNotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resourceId" VARCHAR(100),
    "details" TEXT,
    "ipAddress" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "email" VARCHAR(255),
    "action" VARCHAR(50) NOT NULL,
    "ipAddress" VARCHAR(50),
    "userAgent" VARCHAR(500),
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "statusCode" INTEGER NOT NULL,
    "code" VARCHAR(100),
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" VARCHAR(500) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "ipAddress" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "barbershopId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50),
    "color" VARCHAR(7),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "barbershopId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50),
    "color" VARCHAR(7),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "categoryId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "amount" REAL NOT NULL,
    "type" "ExpenseType" NOT NULL DEFAULT 'VARIABLE',
    "recurrence" "ExpenseRecurrence" NOT NULL DEFAULT 'ONCE',
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paymentMethod" VARCHAR(50),
    "supplierName" VARCHAR(200),
    "receiptUrl" VARCHAR(500),
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiados" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "customerName" VARCHAR(200) NOT NULL,
    "whatsapp" VARCHAR(20) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "originalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" "FiadoStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiado_payments" (
    "id" UUID NOT NULL,
    "fiadoId" UUID NOT NULL,
    "amount" REAL NOT NULL,
    "notes" TEXT,
    "registeredById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiado_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxUses" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "referralCodeId" UUID NOT NULL,
    "referrerUserId" UUID NOT NULL,
    "referrerBarbershopId" UUID NOT NULL,
    "refereeUserId" UUID NOT NULL,
    "refereeBarbershopId" UUID NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardDays" INTEGER NOT NULL DEFAULT 30,
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL,
    "to" VARCHAR(200) NOT NULL,
    "template" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerId" VARCHAR(128),
    "error" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");

-- CreateIndex
CREATE INDEX "users_cpf_idx" ON "users"("cpf");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_mpPaymentId_key" ON "payments"("mpPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerPaymentId_key" ON "payments"("providerPaymentId");

-- CreateIndex
CREATE INDEX "payments_barbershopId_idx" ON "payments"("barbershopId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_mpPaymentId_idx" ON "payments"("mpPaymentId");

-- CreateIndex
CREATE INDEX "payments_providerPaymentId_idx" ON "payments"("providerPaymentId");

-- CreateIndex
CREATE INDEX "payments_externalReference_idx" ON "payments"("externalReference");

-- CreateIndex
CREATE INDEX "payments_externalReference_status_idx" ON "payments"("externalReference", "status");

-- CreateIndex
CREATE INDEX "barbershops_approvalStatus_idx" ON "barbershops"("approvalStatus");

-- CreateIndex
CREATE INDEX "barbershops_active_idx" ON "barbershops"("active");

-- CreateIndex
CREATE INDEX "barbershops_referredByCodeId_idx" ON "barbershops"("referredByCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_barbershopId_dayOfWeek_key" ON "schedules"("barbershopId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "appointments_clientId_idx" ON "appointments"("clientId");

-- CreateIndex
CREATE INDEX "appointments_clientPackageId_idx" ON "appointments"("clientPackageId");

-- CreateIndex
CREATE INDEX "salon_clients_barbershopId_idx" ON "salon_clients"("barbershopId");

-- CreateIndex
CREATE INDEX "salon_clients_whatsapp_idx" ON "salon_clients"("whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "salon_clients_barbershopId_whatsapp_key" ON "salon_clients"("barbershopId", "whatsapp");

-- CreateIndex
CREATE INDEX "service_packages_barbershopId_idx" ON "service_packages"("barbershopId");

-- CreateIndex
CREATE INDEX "service_packages_serviceId_idx" ON "service_packages"("serviceId");

-- CreateIndex
CREATE INDEX "service_packages_active_idx" ON "service_packages"("active");

-- CreateIndex
CREATE INDEX "client_packages_barbershopId_idx" ON "client_packages"("barbershopId");

-- CreateIndex
CREATE INDEX "client_packages_clientId_idx" ON "client_packages"("clientId");

-- CreateIndex
CREATE INDEX "client_packages_status_idx" ON "client_packages"("status");

-- CreateIndex
CREATE INDEX "client_packages_expiresAt_idx" ON "client_packages"("expiresAt");

-- CreateIndex
CREATE INDEX "feed_posts_barbershopId_status_scheduledFor_idx" ON "feed_posts"("barbershopId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "plans_billingCycle_idx" ON "plans"("billingCycle");

-- CreateIndex
CREATE INDEX "plans_tierKey_idx" ON "plans"("tierKey");

-- CreateIndex
CREATE INDEX "plans_hasDashboard_idx" ON "plans"("hasDashboard");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_barbershopId_status_idx" ON "subscriptions"("barbershopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_barbershopId_key" ON "subscriptions"("barbershopId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoices_subscriptionId_status_dueDate_idx" ON "invoices"("subscriptionId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "blocked_entities_type_value_idx" ON "blocked_entities"("type", "value");

-- CreateIndex
CREATE INDEX "blocked_entities_isActive_idx" ON "blocked_entities"("isActive");

-- CreateIndex
CREATE INDEX "blocked_entities_barbershopId_idx" ON "blocked_entities"("barbershopId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- CreateIndex
CREATE INDEX "refunds_barbershopId_idx" ON "refunds"("barbershopId");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE INDEX "admin_notifications_read_idx" ON "admin_notifications"("read");

-- CreateIndex
CREATE INDEX "admin_notifications_type_idx" ON "admin_notifications"("type");

-- CreateIndex
CREATE INDEX "admin_notifications_createdAt_idx" ON "admin_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "access_logs_userId_idx" ON "access_logs"("userId");

-- CreateIndex
CREATE INDEX "access_logs_email_idx" ON "access_logs"("email");

-- CreateIndex
CREATE INDEX "access_logs_action_idx" ON "access_logs"("action");

-- CreateIndex
CREATE INDEX "access_logs_createdAt_idx" ON "access_logs"("createdAt");

-- CreateIndex
CREATE INDEX "error_logs_userId_idx" ON "error_logs"("userId");

-- CreateIndex
CREATE INDEX "error_logs_statusCode_idx" ON "error_logs"("statusCode");

-- CreateIndex
CREATE INDEX "error_logs_createdAt_idx" ON "error_logs"("createdAt");

-- CreateIndex
CREATE INDEX "service_categories_barbershopId_idx" ON "service_categories"("barbershopId");

-- CreateIndex
CREATE INDEX "service_categories_active_idx" ON "service_categories"("active");

-- CreateIndex
CREATE INDEX "expense_categories_barbershopId_idx" ON "expense_categories"("barbershopId");

-- CreateIndex
CREATE INDEX "expenses_barbershopId_idx" ON "expenses"("barbershopId");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE INDEX "expenses_referenceDate_idx" ON "expenses"("referenceDate");

-- CreateIndex
CREATE INDEX "expenses_paidAt_idx" ON "expenses"("paidAt");

-- CreateIndex
CREATE INDEX "expenses_type_idx" ON "expenses"("type");

-- CreateIndex
CREATE INDEX "fiados_barbershopId_idx" ON "fiados"("barbershopId");

-- CreateIndex
CREATE INDEX "fiados_status_idx" ON "fiados"("status");

-- CreateIndex
CREATE INDEX "fiados_whatsapp_idx" ON "fiados"("whatsapp");

-- CreateIndex
CREATE INDEX "fiados_dueDate_idx" ON "fiados"("dueDate");

-- CreateIndex
CREATE INDEX "fiado_payments_fiadoId_idx" ON "fiado_payments"("fiadoId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE INDEX "referral_codes_ownerUserId_idx" ON "referral_codes"("ownerUserId");

-- CreateIndex
CREATE INDEX "referral_codes_barbershopId_idx" ON "referral_codes"("barbershopId");

-- CreateIndex
CREATE INDEX "referral_codes_active_idx" ON "referral_codes"("active");

-- CreateIndex
CREATE INDEX "referrals_referralCodeId_idx" ON "referrals"("referralCodeId");

-- CreateIndex
CREATE INDEX "referrals_referrerUserId_status_idx" ON "referrals"("referrerUserId", "status");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_refereeBarbershopId_key" ON "referrals"("refereeBarbershopId");

-- CreateIndex
CREATE INDEX "email_deliveries_to_idx" ON "email_deliveries"("to");

-- CreateIndex
CREATE INDEX "email_deliveries_template_idx" ON "email_deliveries"("template");

-- CreateIndex
CREATE INDEX "email_deliveries_status_idx" ON "email_deliveries"("status");

-- CreateIndex
CREATE INDEX "email_deliveries_createdAt_idx" ON "email_deliveries"("createdAt");

-- CreateIndex
CREATE INDEX "feedbacks_userId_idx" ON "feedbacks"("userId");

-- CreateIndex
CREATE INDEX "feedbacks_createdAt_idx" ON "feedbacks"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_referredByCodeId_fkey" FOREIGN KEY ("referredByCodeId") REFERENCES "referral_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue" ADD CONSTRAINT "queue_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue" ADD CONSTRAINT "queue_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "client_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_clients" ADD CONSTRAINT "salon_clients_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "service_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiados" ADD CONSTRAINT "fiados_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_payments" ADD CONSTRAINT "fiado_payments_fiadoId_fkey" FOREIGN KEY ("fiadoId") REFERENCES "fiados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "referral_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerBarbershopId_fkey" FOREIGN KEY ("referrerBarbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeBarbershopId_fkey" FOREIGN KEY ("refereeBarbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

