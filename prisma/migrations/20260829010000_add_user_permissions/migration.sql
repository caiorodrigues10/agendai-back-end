-- AlterTable: Add permissions array to users
ALTER TABLE "users" ADD COLUMN "permissions" TEXT[] DEFAULT '{}';
