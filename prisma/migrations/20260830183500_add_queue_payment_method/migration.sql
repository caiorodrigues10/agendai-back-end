-- Align production with QueueItem.paymentMethod used by the queue API.
ALTER TABLE "queue" ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(50);
