-- Voucher money columns
ALTER TABLE "vouchers" ALTER COLUMN "value" TYPE DECIMAL(12,2) USING "value"::decimal;
ALTER TABLE "vouchers" ALTER COLUMN "minPurchase" TYPE DECIMAL(12,2) USING "minPurchase"::decimal;

-- Persist dismissed analytics recommendations
CREATE TABLE "dismissed_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "recommendationId" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "dismissed_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dismissed_recommendations_barbershopId_recommendationId_key" ON "dismissed_recommendations"("barbershopId", "recommendationId");
CREATE INDEX "dismissed_recommendations_barbershopId_idx" ON "dismissed_recommendations"("barbershopId");
ALTER TABLE "dismissed_recommendations" ADD CONSTRAINT "dismissed_recommendations_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
