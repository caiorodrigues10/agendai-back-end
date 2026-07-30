-- AlterTable
ALTER TABLE "queue" ADD COLUMN IF NOT EXISTS "nextInLineNotifiedAt" TIMESTAMP(3);
