-- CreateEnum
CREATE TYPE "ReferralTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- AlterEnum
ALTER TYPE "AdminNotificationType" ADD VALUE IF NOT EXISTS 'REFERRAL_REVOKED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "referral_codes" ADD COLUMN "tier" "ReferralTier" NOT NULL DEFAULT 'BRONZE';

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN "refereeEmail" VARCHAR(100);

-- Backfill refereeEmail from users for existing rows
UPDATE "referrals" r
SET "refereeEmail" = u.email
FROM "users" u
WHERE r."refereeUserId" = u.id
  AND (r."refereeEmail" IS NULL OR r."refereeEmail" = '');

-- Ensure NOT NULL after backfill (fallback empty string if orphan)
UPDATE "referrals" SET "refereeEmail" = '' WHERE "refereeEmail" IS NULL;
ALTER TABLE "referrals" ALTER COLUMN "refereeEmail" SET NOT NULL;

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(100) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_token_idx" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_idx" ON "verification_tokens"("userId");

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
