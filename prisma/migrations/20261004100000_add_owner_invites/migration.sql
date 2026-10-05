-- Convite de dono de salão (assistente do master): guarda apenas o hash
-- SHA-256 do token bruto. O token cru existe somente no link do e-mail.

-- CreateTable
CREATE TABLE "owner_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "invitedById" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_invites_tokenHash_key" ON "owner_invites"("tokenHash");
CREATE INDEX "owner_invites_barbershopId_idx" ON "owner_invites"("barbershopId");
CREATE INDEX "owner_invites_email_idx" ON "owner_invites"("email");
CREATE INDEX "owner_invites_status_idx" ON "owner_invites"("status");

-- AddForeignKey
ALTER TABLE "owner_invites" ADD CONSTRAINT "owner_invites_barbershopId_fkey"
  FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_invites" ADD CONSTRAINT "owner_invites_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DOWN (produção, se necessário):
-- ALTER TABLE "owner_invites" DROP CONSTRAINT IF EXISTS "owner_invites_invitedById_fkey";
-- ALTER TABLE "owner_invites" DROP CONSTRAINT IF EXISTS "owner_invites_barbershopId_fkey";
-- DROP TABLE IF EXISTS "owner_invites";
