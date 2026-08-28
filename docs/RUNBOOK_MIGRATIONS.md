# Runbook: Aplicar migrations do backend em Staging/Produção

## Contexto

O commit `feeb155` adicionou uma migration baseline (`20260726000000_init`) que
executa `CREATE TABLE` para ~30 tabelas. Essas tabelas JÁ EXISTEM em todo banco
real do projeto (dev, staging, produção) — foram criadas originalmente via
`prisma db push`.

Se alguém rodar `prisma migrate deploy` sem preparação, a migration baseline vai
tentar criar tabelas duplicadas e o deploy vai **falhar**.

## ORDEM DOS PASSOS (a ordem importa!)

### 1. Backup

```bash
# Produção (ajustar host/porta/credenciais conforme seu provedor)
pg_dump -h <HOST> -p 5432 -U <USER> -d agendai -F c -f backup_pre_baseline_$(date +%Y%m%d).dump

# Staging (se aplicável)
pg_dump -h <HOST> -p 5432 -U <USER> -d agendai_staging -F c -f backup_pre_baseline_staging_$(date +%Y%m%d).dump
```

### 2. Marcar a baseline como aplicada (SEM executar)

**Este passo DEVE ser feito ANTES de qualquer `migrate deploy`.**

```bash
# Conectado ao banco de staging/produção:
cd backend
npx prisma migrate resolve --applied 20260726000000_init
```

Isso registra no `_prisma_migrations` que a baseline já foi satisfeita,
sem executar nenhum `CREATE TABLE`. As tabelas existentes permanecem intactas.

### 3. Aplicar as migrations pendentes reais

```bash
npx prisma migrate deploy
```

As migrations pendentes reais são:
- `20260827000000_add_user_avatar` — adiciona coluna `avatarUrl` na tabela `users`
- `20260827190000_fix_rls_unset_guc` — corrige RLS policies para tratar NULL no GUC
- `20260828000000_fix_schema_drift` — corrige drifts entre schema.prisma e banco:
  * Corrige tipos em `password_reset_tokens` (TEXT → UUID/VARCHAR)
  * Adiciona coluna `videoUrl` em `feed_posts` (se ausente)
  * Remove tabela `password_reset_otps` (se existir)
  * Remove coluna `phone` de `users` (se existir)

### 4. Validar

```bash
npx prisma migrate status
```

Deve mostrar: **"Database schema is up to date!"**

### 5. Verificar funcionamento da aplicação

```bash
# Confirmar que a API sobe e responde
curl -s http://localhost:3333/health | jq .
# Deve retornar: { "status": "ok", ... }
```

## ⚠️ NOTAS IMPORTANTES

- **NUNCA** rodar `prisma migrate deploy` sem antes marcar o baseline como
  applied. O deploy vai falhar com erro "relation already exists".
- **NUNCA** rodar `prisma db push` em produção. O `db push` desabilita o
  tracking de migrations e pode causar drift silencioso.
- O banco de **dev local** já foi protegido com `migrate resolve --applied`.
  Não precisa repetir esse passo.
- Se o `migrate deploy` falhar em algum passo, o banco fica em estado
  inconsistente. Restaure do backup e tente novamente.
- A migration `20260828000000_fix_schema_drift` usa SQL condicional (`DO`
  blocks) para ser idempotente — funciona tanto em bancos com drift quanto
  em bancos limpos (fresh).

## Drift corrigido pela migration `20260828000000_fix_schema_drift`

### password_reset_tokens

A migration `20260826160000` cria a tabela com tipos `TEXT` para `id`, `email`,
`token`. O `schema.prisma` atual define `id` como UUID, `email` como VARCHAR(100),
`token` como VARCHAR(64). A migration `20260828000000` corrige isso com SQL
condicional que só executa se os tipos ainda estiverem como TEXT.

### Coluna `userId` (UUID, FK → users)

Existia no banco de dev local mas NUNCA existiu em nenhuma migration nem no
`schema.prisma`. Nenhum código usava essa coluna (nem Prisma Client, nem SQL raw).
Foi um vestígio de implementação abandonada. **Removida via SQL direto em
2026-08-28** (cirurgia manual) e agora formalizada na migration.

### Outros drifts corrigidos pela migration

- `feed_posts.videoUrl` — estava ausente do banco dev mas presente no schema.prisma.
  A migration adiciona a coluna com `IF NOT EXISTS` (idempotente).
- `users.phone` — existia no banco dev mas NÃO existe no schema.prisma e nenhum
  código usa `User.phone` (os `.phone` no código são `card.phone`, `input.phone`,
  etc.). A migration remove com `DROP COLUMN IF EXISTS`.
- `password_reset_otps` — tabela existia no banco dev mas NUNCA existiu no
  `schema.prisma` e nenhum código a referencía. A migration remove com
  `DROP TABLE IF EXISTS`.

### Recomendação para staging/produção

Antes de deploy, rodar o diff estrutural contra cada banco para mapear drifts:
```bash
npx prisma migrate diff --from-url "postgresql://..." --to-schema-datamodel prisma/schema.prisma --script
```

## Contato

Em caso de dúvida, entre em contato com o time antes de executar qualquer passo
em produção.
