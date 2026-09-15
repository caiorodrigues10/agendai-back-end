-- CreateEnum
CREATE TYPE "RefreshTokenPurpose" AS ENUM ('session', 'remembered_device');

-- AlterTable: Add purpose column with default 'session' for existing rows
ALTER TABLE "refresh_tokens" ADD COLUMN "purpose" "RefreshTokenPurpose" NOT NULL DEFAULT 'session';

-- CreateIndex: Faster lookups by userId + purpose (used by switch-account and forget-account)
CREATE INDEX "refresh_tokens_userId_purpose_idx" ON "refresh_tokens"("userId", "purpose");
