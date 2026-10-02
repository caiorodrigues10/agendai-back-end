CREATE TYPE "ReviewInvitationStatus" AS ENUM (
  'PENDING',
  'SENT',
  'OPENED',
  'SUBMITTED',
  'EXPIRED',
  'REVOKED'
);

ALTER TABLE "barbershops"
ADD COLUMN IF NOT EXISTS "googleReviewUrl" VARCHAR(500);

CREATE TABLE IF NOT EXISTS "review_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID NOT NULL,
  "appointmentId" UUID,
  "queueItemId" UUID,
  "clientId" UUID,
  "staffId" UUID,
  "tokenHash" VARCHAR(64) NOT NULL,
  "status" "ReviewInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "review_invitations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "client_reviews"
ADD COLUMN IF NOT EXISTS "invitationId" UUID;

ALTER TABLE "client_reviews"
ADD COLUMN IF NOT EXISTS "queueItemId" UUID;

ALTER TABLE "client_reviews"
ALTER COLUMN "appointmentId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "review_invitations_appointmentId_key"
ON "review_invitations"("appointmentId");

CREATE UNIQUE INDEX IF NOT EXISTS "review_invitations_queueItemId_key"
ON "review_invitations"("queueItemId");

CREATE UNIQUE INDEX IF NOT EXISTS "review_invitations_tokenHash_key"
ON "review_invitations"("tokenHash");

CREATE INDEX IF NOT EXISTS "review_invitations_barbershopId_status_createdAt_idx"
ON "review_invitations"("barbershopId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "review_invitations_expiresAt_idx"
ON "review_invitations"("expiresAt");

CREATE INDEX IF NOT EXISTS "review_invitations_clientId_idx"
ON "review_invitations"("clientId");

CREATE UNIQUE INDEX IF NOT EXISTS "client_reviews_invitationId_key"
ON "client_reviews"("invitationId");

CREATE UNIQUE INDEX IF NOT EXISTS "client_reviews_queueItemId_key"
ON "client_reviews"("queueItemId");

ALTER TABLE "review_invitations"
ADD CONSTRAINT "review_invitations_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_invitations"
ADD CONSTRAINT "review_invitations_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_invitations"
ADD CONSTRAINT "review_invitations_queueItemId_fkey"
FOREIGN KEY ("queueItemId") REFERENCES "queue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_invitations"
ADD CONSTRAINT "review_invitations_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_reviews"
ADD CONSTRAINT "client_reviews_queueItemId_fkey"
FOREIGN KEY ("queueItemId") REFERENCES "queue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_reviews"
ADD CONSTRAINT "client_reviews_invitationId_fkey"
FOREIGN KEY ("invitationId") REFERENCES "review_invitations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
