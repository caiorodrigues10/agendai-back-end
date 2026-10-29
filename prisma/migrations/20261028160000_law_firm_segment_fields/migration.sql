-- Segmento LAW_FIRM (Serviços profissionais) + campos do item 4 do plano.
--
-- Tudo aditivo:
--  * enum BusinessSegment ganha LAW_FIRM;
--  * enum AppointmentModality (presencial / vídeo / telefone);
--  * services.publicBookable — serviço agendável pelo cliente (padrão true);
--  * barbershops.practiceAreas (tags) e barbershops.oabRegistration;
--  * tabela client_cases (ficha auxiliar "caso/processo", como pet e veículo);
--  * appointments: caseId/caseName (snapshot), practiceArea, modality, meetingLink.
--
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.

-- AlterEnum (BusinessSegment)
DO $$
DECLARE
  v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY['LAW_FIRM'] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'BusinessSegment'
         AND e.enumlabel = v
    ) THEN
      EXECUTE format('ALTER TYPE "BusinessSegment" ADD VALUE %L', v);
    END IF;
  END LOOP;
END $$;

-- AlterEnum (AppointmentModality)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentModality') THEN
    CREATE TYPE "AppointmentModality" AS ENUM ('IN_PERSON', 'VIDEO', 'PHONE');
  END IF;
END $$;

-- AlterTable (services): serviço público x interno
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "publicBookable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable (barbershops): áreas de atuação e registro na OAB
ALTER TABLE "barbershops" ADD COLUMN IF NOT EXISTS "practiceAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "barbershops" ADD COLUMN IF NOT EXISTS "oabRegistration" VARCHAR(40);

-- AlterTable (appointments): caso/processo, área, modalidade e link da reunião
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "caseId" UUID;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "caseName" VARCHAR(120);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "practiceArea" VARCHAR(80);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "meetingLink" VARCHAR(500);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "modality" "AppointmentModality" NOT NULL DEFAULT 'IN_PERSON';

-- CreateTable (client_cases)
-- Sem DEFAULT em "id": `@default(uuid())` do Prisma 6.4 é client-side
-- (runbook de migrations — DEFAULT escrito à mão vira drift permanente).
CREATE TABLE IF NOT EXISTS "client_cases" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "nickname" VARCHAR(120) NOT NULL,
    "practiceArea" VARCHAR(80),
    "caseNumber" VARCHAR(30),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "client_cases_barbershopId_clientId_idx"
  ON "client_cases"("barbershopId", "clientId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_cases_barbershopId_fkey'
  ) THEN
    ALTER TABLE "client_cases"
      ADD CONSTRAINT "client_cases_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_cases_clientId_fkey'
  ) THEN
    ALTER TABLE "client_cases"
      ADD CONSTRAINT "client_cases_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Enable RLS (mesma variante de `client_pets`: rotas staff setam o GUC;
-- fluxos públicos sem contexto caem no ramo '' e são filtrados pela app)
ALTER TABLE "client_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_cases" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_cases' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON "client_cases"
      USING (current_setting('app.current_barbershop_id', true) = ''
             OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);
  END IF;
END $$;
