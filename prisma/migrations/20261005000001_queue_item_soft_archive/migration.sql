-- migrations/20261005000001_queue_item_soft_archive
--
-- Arquivamento lógico de itens da fila ("remover da visualização"):
-- DELETE /queue/:id deixa de apagar fisicamente e passa a marcar
-- archivedAt/archivedBy/archiveReason. Comissões (commission_entries CASCADE)
-- e lançamentos do ledger ancorados no item NÃO são mais destruídos.
--
-- Migration apenas aditiva (ADD COLUMN NULL): sem backfill obrigatório,
-- sem DROP, segura para `prisma migrate deploy` em produção.
-- Regra do runbook aplicada: gerada via `migrate diff` do banco local
-- (DATABASE_URL e DIRECT_URL neutras), verificada vazia depois de aplicada.

-- AlterTable
ALTER TABLE "queue" ADD COLUMN     "archiveReason" VARCHAR(200),
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedBy" UUID;
