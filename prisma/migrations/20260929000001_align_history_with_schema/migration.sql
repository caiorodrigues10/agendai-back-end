-- Alinha o estado final do histórico de migrations com prisma/schema.prisma.
--
-- 1) `barbershops.city` só existia em bancos criados via `prisma db push`
--    (dev/prod). Bancos novos, montados só com `migrate deploy`, ficavam sem a
--    coluna e qualquer `findMany` em Barbershop quebrava (SELECT de campo
--    inexistente) — era o motivo do 500 em GET /api/barbershops.
ALTER TABLE "barbershops" ADD COLUMN IF NOT EXISTS "city" VARCHAR(120);

-- 2) A unicidade de WhatsApp mudou para (barbershopId, normalizedWhatsapp) em
--    20260901000000, mas o DROP CONSTRAINT ali era no-op: o índice é um
--    `CREATE UNIQUE INDEX` (índice puro, não constraint). Remove o índice órfão.
DROP INDEX IF EXISTS "salon_clients_barbershopId_whatsapp_key";
