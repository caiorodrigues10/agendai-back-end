-- AlterTable: Make equipmentId nullable on equipment_movements
ALTER TABLE "equipment_movements" ALTER COLUMN "equipmentId" DROP NOT NULL;

-- DropForeignKey: Remove old CASCADE constraint
ALTER TABLE "equipment_movements" DROP CONSTRAINT "equipment_movements_equipmentId_fkey";

-- AddForeignKey: Re-create with ON DELETE SET NULL
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_equipmentId_fkey"
    FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL;
