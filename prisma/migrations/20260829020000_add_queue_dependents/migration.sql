-- Vincula entradas de dependentes ao cliente responsável na mesma fila.
ALTER TABLE "queue"
ADD COLUMN "responsibleQueueItemId" UUID;

ALTER TABLE "queue"
ADD CONSTRAINT "queue_responsibleQueueItemId_fkey"
FOREIGN KEY ("responsibleQueueItemId") REFERENCES "queue"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "queue_responsibleQueueItemId_idx"
ON "queue"("responsibleQueueItemId");
