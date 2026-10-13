-- Veículos dos clientes (MVP automotivo).
--
-- Espelha `client_pets`: entidade filha de `salon_clients` para o lava jato e
-- a oficina guardarem placa + modelo do veículo do cliente. Ano, FIPE e
-- valor de tabela são pendência.
--
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.

-- CreateTable
-- Sem DEFAULT em "id": `@default(uuid())` do Prisma 6.4 é client-side
-- (runbook de migrations — DEFAULT escrito à mão vira drift permanente).
CREATE TABLE IF NOT EXISTS "client_vehicles" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "plate" VARCHAR(8) NOT NULL,
    "vehicleModel" VARCHAR(120) NOT NULL,
    "color" VARCHAR(40),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (mesma restrição do schema: um veículo por cliente)
CREATE UNIQUE INDEX IF NOT EXISTS "client_vehicles_barbershopId_clientId_plate_key"
  ON "client_vehicles"("barbershopId", "clientId", "plate");

CREATE INDEX IF NOT EXISTS "client_vehicles_barbershopId_clientId_idx"
  ON "client_vehicles"("barbershopId", "clientId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_vehicles_barbershopId_fkey'
  ) THEN
    ALTER TABLE "client_vehicles"
      ADD CONSTRAINT "client_vehicles_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_vehicles_clientId_fkey'
  ) THEN
    ALTER TABLE "client_vehicles"
      ADD CONSTRAINT "client_vehicles_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Enable RLS (mesma variante de `client_pets`: rotas staff setam o GUC;
-- fluxos públicos sem contexto caem no ramo '' e são filtrados pela app)
ALTER TABLE "client_vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_vehicles" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_vehicles' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON "client_vehicles"
      USING (current_setting('app.current_barbershop_id', true) = ''
             OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);
  END IF;
END $$;
