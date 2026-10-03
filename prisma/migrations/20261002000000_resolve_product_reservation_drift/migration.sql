-- Resolve drift de schema entre prisma/schema.prisma e o Supabase de produção.
-- Criada em 2026-10-02 após inspeção com `prisma migrate diff`.
--
-- 1) Remove a tabela órfã "product_reservations" e o enum "ProductReservationStatus":
--    existiam apenas no banco de produção, vindos da migration
--    20261001120000_add_product_reservations, que nunca existiu no repositório.
--    A tabela tinha 0 linhas, nenhum código a referencia, nenhum modelo em
--    schema.prisma, nenhuma view/trigger dependente. O código usa
--    "appointment_product_reservations" (model AppointmentProductReservation).
--    DDL de restauração: docs/backup-product_reservations-20261001.sql
--
-- 2) Remove o DEFAULT gen_random_uuid() de appointment_product_reservations.id:
--    o model declara @default(uuid()) (gerado pelo cliente) e o Prisma 6.4
--    não gera DEFAULT para esse caso — as outras 144 tabelas uuid têm id sem
--    DEFAULT. O DEFAULT divergia do schema e aparecia como drift no diff.

DROP TABLE IF EXISTS "product_reservations";

DROP TYPE IF EXISTS "ProductReservationStatus";

ALTER TABLE "appointment_product_reservations" ALTER COLUMN "id" DROP DEFAULT;
