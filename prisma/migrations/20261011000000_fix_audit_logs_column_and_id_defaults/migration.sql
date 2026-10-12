-- Correcao de drift detectado por `prisma migrate diff --exit-code` em banco
-- criado SO com `migrate deploy` (exatamente o que o CI faz). Duas causas:
--
-- 1) COLUNA DE SALAO EM audit_logs (bug de runtime)
--    `20261004000300_add_audit_log_barbershop_id` criou a coluna como
--    `barbershop_id`, mas o modelo Prisma declara `barbershopId` SEM `@map`.
--    Em todo banco de `migrate deploy` o Prisma Client falha com P2022
--    "The column `audit_logs.barbershopId` does not exist". O hook de
--    auditoria de `src/shared/infra/http/app.ts` engolia o erro (try/catch),
--    entao o bug era invisivel em runtime e so aparecia no diff de schema.
--    Prova (falha antes / passa depois):
--      src/tests/integration/auditLogColumn.spec.ts
--
-- 2) DEFAULTS DE `id` INOFENSIVOS
--    `20261004000400_add_nps_surveys` e `20261004100000_add_owner_invites`
--    criaram `id` com `DEFAULT gen_random_uuid()`, enquanto o schema usa
--    `@default(uuid())` — gerado NO CLIENTE. O Prisma sempre envia o `id`,
--    entao o default do banco nunca e usado: e inofensivo, mas mantem o
--    drift e deixa `migrate diff --exit-code` retornando 2 (CI vermelho).
--
-- Todas as operacoes sao idempotentes: rodar de novo nao faz nada e nao falha.

-- 1) Renomeia a coluna apenas se a antiga existir e a nova ainda nao existir.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'audit_logs'
			AND column_name = 'barbershop_id'
	) AND NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'audit_logs'
			AND column_name = 'barbershopId'
	) THEN
		ALTER TABLE "audit_logs" RENAME COLUMN "barbershop_id" TO "barbershopId";
	END IF;
END $$;

-- Mesma logica para o indice (nome tambem estava em snake_case).
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_indexes
		WHERE schemaname = current_schema()
			AND tablename = 'audit_logs'
			AND indexname = 'audit_logs_barbershop_id_idx'
	) AND NOT EXISTS (
		SELECT 1
		FROM pg_indexes
		WHERE schemaname = current_schema()
			AND tablename = 'audit_logs'
			AND indexname = 'audit_logs_barbershopId_idx'
	) THEN
		ALTER INDEX "audit_logs_barbershop_id_idx" RENAME TO "audit_logs_barbershopId_idx";
	END IF;
END $$;

-- 2) Remove os defaults que o schema nao declara (`ALTER ... DROP DEFAULT` ja e
--    idempotente no Postgres: sem default, e um no-op).
ALTER TABLE "nps_responses" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "nps_surveys" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "owner_invites" ALTER COLUMN "id" DROP DEFAULT;
