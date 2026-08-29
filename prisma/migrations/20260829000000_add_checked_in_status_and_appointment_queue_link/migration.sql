-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'CHECKED_IN';

-- AlterTable: Add appointmentId to queue
ALTER TABLE "queue" ADD COLUMN "appointmentId" UUID;

-- CreateIndex
CREATE INDEX "queue_appointmentId_idx" ON "queue"("appointmentId");

-- AddForeignKey
ALTER TABLE "queue" ADD CONSTRAINT "queue_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
