-- 1 CPF = 1 conta, sempre.
--
-- Defesa em profundidade para bancos que nasceram de `db push` (drift) e nunca
-- receberam o índice do `fix_schema_drift_v2`. Idempotente: reaproveita a mesma
-- dedupe (mantém a conta mais antiga legítima e anula o cpf das duplicatas)
-- e o CREATE UNIQUE INDEX IF NOT EXISTS.
--
-- Soft delete anula o cpf (`DeleteAccountUseCase`), então o índice cheio (sem
-- cláusula parcial) libera o CPF para reuso após exclusão da conta — coerente
-- com o schema (`cpf String? @unique`) e com a migration original.

-- Dedupe: para cada cpf repetido, só a linha "rn = 1" sobrevive.
UPDATE "users" u SET "cpf" = NULL
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "cpf"
      ORDER BY (lower("name") ~ 'test|demo|exemplo') ASC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "users"
  WHERE "cpf" IS NOT NULL
) d
WHERE u."id" = d."id" AND d."rn" > 1;

-- Índice único (fonte da verdade contra corrida findFirst → create).
CREATE UNIQUE INDEX IF NOT EXISTS "users_cpf_key" ON "users"("cpf");

-- Acompanhamento para busca por cpf no pre-check do registro.
CREATE INDEX IF NOT EXISTS "users_cpf_idx" ON "users"("cpf");
