-- ============================================================
-- Equipment Inventory Control — replaces old resources module
-- ============================================================
-- RULES enforced at application layer (equipmentUseCases.ts):
--   • quantityAvailable never goes negative
--   • quantityAvailable never exceeds quantityTotal
--   • serialNumber uniqueness per barbershop (when not null)
-- ============================================================

-- Drop old tables (0 rows confirmed)
DROP TABLE IF EXISTS "resource_bookings" CASCADE;
DROP TABLE IF EXISTS "resources" CASCADE;

-- Drop old enums
DROP TYPE IF EXISTS "ResourceBookingStatus" CASCADE;
DROP TYPE IF EXISTS "ResourceType" CASCADE;

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('BARBER_TOOLS', 'BEARD_TOOLS', 'AESTHETICS', 'FURNITURE', 'CLEANING', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipmentCondition" AS ENUM ('NEW', 'GOOD', 'WORN', 'BROKEN', 'IN_MAINTENANCE');

-- CreateEnum
CREATE TYPE "EquipmentMovementType" AS ENUM ('IN', 'OUT', 'MAINTENANCE', 'LOSS', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "EquipmentNeedPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "EquipmentNeedStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'REJECTED');

-- CreateTable: equipment
CREATE TABLE "equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" "EquipmentCategory" NOT NULL DEFAULT 'OTHER',
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "quantityTotal" INTEGER NOT NULL DEFAULT 1,
    "quantityAvailable" INTEGER NOT NULL DEFAULT 1,
    "condition" "EquipmentCondition" NOT NULL DEFAULT 'NEW',
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(10,2),
    "supplier" VARCHAR(150),
    "purchaseDate" TIMESTAMPTZ,
    "warrantyUntil" TIMESTAMPTZ,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: equipment_movements
CREATE TABLE "equipment_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipmentId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "type" "EquipmentMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" VARCHAR(300),
    "staffId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "equipment_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable: equipment_needs
CREATE TABLE "equipment_needs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "equipmentId" UUID,
    "name" VARCHAR(150) NOT NULL,
    "quantityNeeded" INTEGER NOT NULL DEFAULT 1,
    "priority" "EquipmentNeedPriority" NOT NULL DEFAULT 'MEDIUM',
    "reason" TEXT,
    "estimatedCost" DECIMAL(10,2),
    "status" "EquipmentNeedStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "resolvedAt" TIMESTAMPTZ,

    CONSTRAINT "equipment_needs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_barbershopId_category_idx" ON "equipment"("barbershopId", "category");
CREATE INDEX "equipment_barbershopId_isActive_idx" ON "equipment"("barbershopId", "isActive");

-- CreateIndex
CREATE INDEX "equipment_movements_equipmentId_createdAt_idx" ON "equipment_movements"("equipmentId", "createdAt");
CREATE INDEX "equipment_movements_barbershopId_createdAt_idx" ON "equipment_movements"("barbershopId", "createdAt");

-- CreateIndex
CREATE INDEX "equipment_needs_barbershopId_status_idx" ON "equipment_needs"("barbershopId", "status");
CREATE INDEX "equipment_needs_barbershopId_priority_idx" ON "equipment_needs"("barbershopId", "priority");
CREATE INDEX "equipment_needs_equipmentId_idx" ON "equipment_needs"("equipmentId");

-- AddForeignKey: equipment → barbershops
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_barbershopId_fkey"
    FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- AddForeignKey: equipment_movements → equipment
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_equipmentId_fkey"
    FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE;

-- AddForeignKey: equipment_movements → barbershops
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_barbershopId_fkey"
    FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- AddForeignKey: equipment_movements → users (staff)
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL;

-- AddForeignKey: equipment_needs → barbershops
ALTER TABLE "equipment_needs" ADD CONSTRAINT "equipment_needs_barbershopId_fkey"
    FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE;

-- AddForeignKey: equipment_needs → equipment
ALTER TABLE "equipment_needs" ADD CONSTRAINT "equipment_needs_equipmentId_fkey"
    FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL;

-- AddForeignKey: equipment_needs → users (requester)
ALTER TABLE "equipment_needs" ADD CONSTRAINT "equipment_needs_requestedBy_fkey"
    FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE SET NULL;

-- Note on inverse relations (User → EquipmentMovement, User → EquipmentNeed):
-- Prisma resolves these at the client level via the FKs above.
-- No SQL columns are added to the users table.
