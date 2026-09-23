-- AlterEnum: user-facing Support/Bug-Report channel and categories
ALTER TYPE "TicketChannel" ADD VALUE IF NOT EXISTS 'IN_APP';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'SUGGESTION';
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'FEEDBACK';
