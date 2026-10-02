CREATE TYPE "ReferralCreditLedgerType" AS ENUM ('CREDIT', 'REVERSAL');

CREATE TABLE IF NOT EXISTS "referral_credit_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "referralId" UUID NOT NULL,
  "referrerBarbershopId" UUID NOT NULL,
  "subscriptionId" UUID,
  "type" "ReferralCreditLedgerType" NOT NULL,
  "days" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "reason" VARCHAR(200),
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_credit_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_credit_ledger_idempotencyKey_key"
ON "referral_credit_ledger"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "referral_credit_ledger_referralId_idx"
ON "referral_credit_ledger"("referralId");

CREATE INDEX IF NOT EXISTS "referral_credit_ledger_referrerBarbershopId_createdAt_idx"
ON "referral_credit_ledger"("referrerBarbershopId", "createdAt");

CREATE INDEX IF NOT EXISTS "referral_credit_ledger_subscriptionId_idx"
ON "referral_credit_ledger"("subscriptionId");
