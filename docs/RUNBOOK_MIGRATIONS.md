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

### 4. Validar

```bash
npx prisma migrate status
```

Deve mostrar: **"Database schema is up to date!"**

### 5. Verificar应用 da aplicação

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

## Drift conhecido

O diff estrutural (`prisma migrate diff --from-migrations ... --to-schema-datamodel`)
mostra 1 divergência pré-existente: a tabela `password_reset_tokens` foi criada
com tipos `TEXT` na migration `20260826160000`, mas o `schema.prisma` atual define
`id` como UUID, `email` como VARCHAR(100), e `token` como VARCHAR(64). Isso
precisará de uma migration de correção futura (gerada via `prisma migrate dev`).

## Contato

Em caso de dúvida, entre em contato com o time antes de executar qualquer passo
em produção.
