-- Coluna real de salão em audit_logs (substitui o filtro heurístico por
-- resourceId/uuid na action). O backfill histórico é feito por script
-- (`npm run audit:backfill-shop`, com --dry-run antes do apply).
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "barbershop_id" uuid;

CREATE INDEX IF NOT EXISTS "audit_logs_barbershop_id_idx" ON "audit_logs"("barbershop_id");

-- DOWN (produção, se necessário):
-- DROP INDEX IF EXISTS "audit_logs_barbershop_id_idx";
-- ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "barbershop_id";
