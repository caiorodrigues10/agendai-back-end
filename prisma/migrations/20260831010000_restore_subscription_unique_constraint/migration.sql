-- Restore the unique constraint required by Prisma subscription upsert().
-- The application expects one subscription row per barbershop.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'subscriptions'
      AND indexname = 'subscriptions_barbershopId_key'
  ) THEN
    CREATE UNIQUE INDEX "subscriptions_barbershopId_key"
      ON "subscriptions" ("barbershopId");
  END IF;
END $$;
