-- AlterTable
ALTER TABLE "queue" DROP COLUMN "nextInLineNotifiedAt",
ADD COLUMN     "lastNotifiedPosition" INTEGER;

