CREATE TABLE IF NOT EXISTS "appointment_product_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "barbershopId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "productName" VARCHAR(160) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" REAL NOT NULL,
  "imageUrl" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "appointment_product_reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "appointment_product_reservations_barbershopId_appointmentId_idx"
ON "appointment_product_reservations"("barbershopId", "appointmentId");

CREATE INDEX IF NOT EXISTS "appointment_product_reservations_productId_idx"
ON "appointment_product_reservations"("productId");

ALTER TABLE "appointment_product_reservations"
ADD CONSTRAINT "appointment_product_reservations_barbershopId_fkey"
FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_product_reservations"
ADD CONSTRAINT "appointment_product_reservations_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_product_reservations"
ADD CONSTRAINT "appointment_product_reservations_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
