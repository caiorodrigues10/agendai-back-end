-- Pets dos clientes (MVP petshop).
--
-- Entidade filha de `salon_clients`, no mesmo padrão de
-- `client_procedure_records`: snapshot de nome/espécie/raça/porte/pelagem
-- para o agendamento e a fila do petshop. Preço por porte é pendência.
--
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PetSpecies'
  ) THEN
    CREATE TYPE "PetSpecies" AS ENUM ('DOG', 'CAT', 'OTHER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PetSize'
  ) THEN
    CREATE TYPE "PetSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE');
  END IF;
END $$;

-- CreateTable
-- Sem DEFAULT em "id": `@default(uuid())` do Prisma 6.4 é client-side
-- (runbook de migrations — DEFAULT escrito à mão vira drift permanente).
CREATE TABLE IF NOT EXISTS "client_pets" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "species" "PetSpecies" NOT NULL DEFAULT 'OTHER',
    "breed" VARCHAR(120),
    "size" "PetSize",
    "coat" VARCHAR(120),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "client_pets_barbershopId_clientId_idx"
  ON "client_pets"("barbershopId", "clientId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_pets_barbershopId_fkey'
  ) THEN
    ALTER TABLE "client_pets"
      ADD CONSTRAINT "client_pets_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_pets_clientId_fkey'
  ) THEN
    ALTER TABLE "client_pets"
      ADD CONSTRAINT "client_pets_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Enable RLS (variante pública-segura: rotas staff sempre setam o GUC;
-- fluxos públicos sem contexto caem no ramo '' e são filtrados pela app)
ALTER TABLE "client_pets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_pets" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_pets' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON "client_pets"
      USING (current_setting('app.current_barbershop_id', true) = ''
             OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);
  END IF;
END $$;
