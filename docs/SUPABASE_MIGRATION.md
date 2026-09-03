# Migração PostgreSQL Render → Supabase

Este runbook migra somente o PostgreSQL. JWT, Redis/BullMQ, GCS, Evolution API,
Resend e provedores de pagamento permanecem inalterados.

## Regras de segurança

- Nunca commitar `DATABASE_URL`, `DIRECT_URL`, dumps ou senhas.
- Nunca executar `prisma db push` no banco de produção.
- Não usar `--clean` contra o banco do Render.
- Manter o banco Render intacto por 7–14 dias após o cutover.
- Fazer a migração com a API, worker e scheduler parados ou em manutenção.

## Variáveis

`DATABASE_URL` é a conexão de runtime, preferencialmente o Session Pooler do
Supabase. `DIRECT_URL` é a conexão direta usada pelo Prisma Migrate, `pg_dump` e
`pg_restore`. Ambas devem usar SSL em produção.

Antes de operar, confirmar que as duas variáveis estão definidas sem imprimi-las:

```powershell
if (-not $env:DATABASE_URL -or -not $env:DIRECT_URL) { throw 'DATABASE_URL/DIRECT_URL ausente' }
```

## Backup do Render

Com a aplicação parada e a senha fornecida por mecanismo seguro:

```powershell
pg_dump --format=custom --no-owner --no-acl --verbose `
  --file=agendai-render-pre-migration.dump "$env:RENDER_DATABASE_URL"
pg_dump --schema-only --no-owner --no-acl `
  --file=agendai-render-schema.sql "$env:RENDER_DATABASE_URL"
Get-FileHash .\agendai-render-pre-migration.dump -Algorithm SHA256
pg_restore --list .\agendai-render-pre-migration.dump > .\agendai-render-contents.txt
```

Restaurar primeiro em um PostgreSQL temporário e validar contagens, IDs,
relações, login, serviços, agenda e financeiro.

## Preparação do Supabase

No projeto Supabase novo, habilitar apenas as extensões exigidas pelo schema,
principalmente `pgcrypto`. Confirmar região, backups e retenção antes do uso.

Com o banco vazio:

```powershell
$env:DATABASE_URL=$env:SUPABASE_DIRECT_URL
$env:DIRECT_URL=$env:SUPABASE_DIRECT_URL
npx prisma migrate deploy
```

Não restaurar o dump completo depois de aplicar migrations. Nesse cenário,
restaurar somente dados em banco previamente preparado ou escolher a estratégia
de restauração completa em um projeto vazio e então executar `migrate status`.

## Cutover

1. Ativar manutenção e bloquear escritas.
2. Parar workers/scheduler e aguardar requests.
3. Fazer dump final do Render.
4. Restaurar e verificar o Supabase.
5. Executar `npx prisma migrate deploy` usando `DIRECT_URL`.
6. Configurar `DATABASE_URL` para o Session Pooler e `DIRECT_URL` para a conexão direta.
7. Reiniciar uma única API com migrations habilitadas.
8. Validar `/ready`, `/health` e smoke tests.
9. Liberar primeiro para usuário interno e depois remover a manutenção.

## Reconciliação obrigatória

Comparar entre origem e destino contagens, IDs, tenants e somas por salão para
`barbershops`, `users`, `services`, `queue`, `appointments`, clientes, pacotes,
fiados, pagamentos, despesas, assinaturas, invoices, comissões, eventos CRM,
notificações e idempotência.

Reconciliar também:

- totais brutos, recebidos e em aberto;
- saldo de fiado;
- sessões de pacote;
- comissões;
- registros financeiros por período;
- políticas RLS e contexto `app.current_barbershop_id`.

Qualquer divergência financeira, de tenant ou de schema interrompe o cutover.

## Rollback

Bloquear escritas, restaurar as variáveis anteriores do Render, reiniciar API,
worker e scheduler, validar `/ready` e executar os smokes. Se já houver escritas
no Supabase, gerar relatório de divergência antes de descartá-las.
