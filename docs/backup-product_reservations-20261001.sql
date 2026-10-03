-- BACKUP de DDL orfao do Supabase (producao)
-- Gerado: 2026-10-02T02:03:27.052Z
-- Motivo: tabela + enum nao existem em prisma/schema.prisma nem em prisma/migrations;
--         migracao 20261001120000_add_product_reservations so existe no banco.
-- Para restaurar: executar este arquivo inteiro.

CREATE TYPE "ProductReservationStatus" AS ENUM ('RESERVED', 'PICKED_UP', 'CANCELED');

CREATE TABLE "product_reservations" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "customerName" VARCHAR(160) NOT NULL,
  "whatsapp" VARCHAR(20) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" REAL NOT NULL,
  "status" "ProductReservationStatus" NOT NULL DEFAULT 'RESERVED'::"ProductReservationStatus",
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL
,
  CONSTRAINT "product_reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_reservations_barbershopId_status_createdAt_idx" ON public.product_reservations USING btree ("barbershopId", status, "createdAt");
CREATE INDEX "product_reservations_productId_status_idx" ON public.product_reservations USING btree ("productId", status);
CREATE INDEX "product_reservations_status_expiresAt_idx" ON public.product_reservations USING btree (status, "expiresAt");

ALTER TABLE "product_reservations" ADD CONSTRAINT "product_reservations_barbershopId_fkey"
  FOREIGN KEY (barbershopId) REFERENCES "barbershops" (id)
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_reservations" ADD CONSTRAINT "product_reservations_productId_fkey"
  FOREIGN KEY (productId) REFERENCES "products" (id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Fim do backup.
