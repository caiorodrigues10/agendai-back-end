ALTER TABLE "services"
ADD COLUMN IF NOT EXISTS "commissionPercent" REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "commission_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID NOT NULL,
  "queueItemId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "professionalId" UUID NOT NULL,
  "percentage" REAL NOT NULL,
  "amount" REAL NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_entries_queueItemId_professionalId_key" UNIQUE ("queueItemId", "professionalId"),
  CONSTRAINT "commission_entries_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "commission_entries_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "queue"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "commission_entries_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commission_entries_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "commission_entries_barbershopId_createdAt_idx" ON "commission_entries"("barbershopId", "createdAt");
CREATE INDEX IF NOT EXISTS "commission_entries_professionalId_createdAt_idx" ON "commission_entries"("professionalId", "createdAt");
