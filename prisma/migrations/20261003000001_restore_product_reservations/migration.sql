-- migrations/20261003000001_restore_product_reservations
--
-- RESTAURA a tabela `product_reservations` + enum `ProductReservationStatus`
-- que foram removidos de produção pela migration
-- 20261002000000_resolve_product_reservation_drift.
--
-- Contexto: na data daquela remoção, a migration 20261001120000_add_product_reservations
-- constava como aplicada em produção mas não existia em nenhum ref do git (o
-- histórico de main ainda não tinha recebido o commit 632bec2), o que tornou a
-- tabela parecer um DDL órfão. Depois o commit 632bec2
-- "feat(products): public product reservations with panel pickup flow" entrou em
-- main com o model `ProductReservation` no schema.prisma e o módulo completo
-- (controller/repository/routes/schemas/use-cases/testes), provando que a tabela
-- é feature ativa.
--
-- Princípio de Prisma: nunca se edita uma migration já aplicada; resolve-se para
-- frente. Este arquivo reaplica fielmente o DDL de
-- 20261001120000_add_product_reservations. Replay completo fica
-- create -> drop -> create = estado final idêntico ao schema.prisma.

-- CreateEnum
CREATE TYPE "ProductReservationStatus" AS ENUM ('RESERVED', 'PICKED_UP', 'CANCELED');

-- CreateTable
CREATE TABLE "product_reservations" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "customerName" VARCHAR(160) NOT NULL,
    "whatsapp" VARCHAR(20) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "status" "ProductReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_reservations_pkey" PRIMARY KEY ("id")
);

-- Check: quantidade sempre positiva (a borda da API também limita a 1..10 via Zod).
ALTER TABLE "product_reservations" ADD CONSTRAINT "product_reservations_quantity_positive" CHECK ("quantity" > 0);

-- CreateIndex
CREATE INDEX "product_reservations_barbershopId_status_createdAt_idx" ON "product_reservations"("barbershopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "product_reservations_productId_status_idx" ON "product_reservations"("productId", "status");

-- CreateIndex
CREATE INDEX "product_reservations_status_expiresAt_idx" ON "product_reservations"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "product_reservations" ADD CONSTRAINT "product_reservations_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reservations" ADD CONSTRAINT "product_reservations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "product_reservations" ENABLE ROW LEVEL SECURITY;

-- Force RLS for app user
ALTER TABLE "product_reservations" FORCE ROW LEVEL SECURITY;

-- Policy (mesmo formato do migration 20260827190000_fix_rls_unset_guc):
-- COALESCE trata o GUC ausente como '' (leituras públicas sem setRlsContext
-- continuam visíveis) e NULLIF evita erro de cast de '' para uuid.
CREATE POLICY "tenant_isolation" ON "product_reservations"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );
