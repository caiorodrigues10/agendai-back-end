-- CreateEnum
CREATE TYPE "OperationMode" AS ENUM ('QUEUE_ONLY', 'APPOINTMENTS_ONLY', 'HYBRID');

-- AlterTable: add operationMode with default HYBRID
ALTER TABLE "barbershops" ADD COLUMN "operationMode" "OperationMode" NOT NULL DEFAULT 'HYBRID';

-- All existing shops are HYBRID (the default), no data migration needed.
