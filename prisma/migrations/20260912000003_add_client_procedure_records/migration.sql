-- CreateTable
CREATE TABLE "client_procedure_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "professionalName" VARCHAR(200) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "formula" VARCHAR(500),
    "details" TEXT,
    "serviceName" VARCHAR(200),
    "queueItemId" UUID,
    "appointmentId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_procedure_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_procedure_records_barbershopId_clientId_occurredAt_idx" ON "client_procedure_records"("barbershopId", "clientId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "client_procedure_records_barbershopId_clientId_idx" ON "client_procedure_records"("barbershopId", "clientId");

-- AddForeignKey
ALTER TABLE "client_procedure_records" ADD CONSTRAINT "client_procedure_records_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_procedure_records" ADD CONSTRAINT "client_procedure_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "client_procedure_records" ENABLE ROW LEVEL SECURITY;

-- Force RLS
ALTER TABLE "client_procedure_records" FORCE ROW LEVEL SECURITY;

-- Create Policy
CREATE POLICY "tenant_isolation" ON "client_procedure_records"
  USING ("barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);
