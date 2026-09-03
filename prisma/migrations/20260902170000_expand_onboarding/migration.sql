ALTER TABLE "barbershop_onboardings"
  ADD COLUMN IF NOT EXISTS "welcomeSeenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "operationModeConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);

-- Contas que já existiam antes da central de missões não devem ser
-- redirecionadas como se estivessem fazendo o primeiro login.
INSERT INTO "barbershop_onboardings" ("id", "barbershopId", "welcomeSeenAt", "dismissedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "barbershops" b
ON CONFLICT ("barbershopId") DO UPDATE
SET "welcomeSeenAt" = COALESCE("barbershop_onboardings"."welcomeSeenAt", CURRENT_TIMESTAMP);
