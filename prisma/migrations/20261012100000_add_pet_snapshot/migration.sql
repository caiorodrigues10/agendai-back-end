-- Snapshot de pet no agendamento e na fila (MVP petshop).
--
-- `petId` referencia `client_pets` (sem FK: o snapshot sobrevive à exclusão
-- do pet; `petName` é a fonte de exibição). Colunas opcionais — salões de
-- outros segmentos continuam com NULL.
--
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "petId" UUID;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "petName" VARCHAR(120);

ALTER TABLE "queue" ADD COLUMN IF NOT EXISTS "petId" UUID;
ALTER TABLE "queue" ADD COLUMN IF NOT EXISTS "petName" VARCHAR(120);
