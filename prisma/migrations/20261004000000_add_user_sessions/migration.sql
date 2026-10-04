-- Sessões de login rastreáveis (claim `sid` em access + refresh token).
-- Reversível: para desfazer, execute o bloco final deste arquivo em ordem inversa.

CREATE TABLE IF NOT EXISTS "user_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "barbershopId" UUID,
    "refreshTokenId" UUID,
    "rememberedTokenId" UUID,
    "deviceLabel" VARCHAR(120),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revokedReason" VARCHAR(500),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_sessions_userId_revokedAt_idx"
ON "user_sessions"("userId", "revokedAt");

CREATE INDEX IF NOT EXISTS "user_sessions_expiresAt_idx"
ON "user_sessions"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_userId_fkey'
  ) THEN
    ALTER TABLE "user_sessions"
      ADD CONSTRAINT "user_sessions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Reversão (down):
-- DROP TABLE IF EXISTS "user_sessions";
