# Runbook de migrations — staging e produção

## Estado conhecido

O banco de produção já está baselined: as migrations versionadas atuais possuem
registro concluído em `_prisma_migrations`. O bootstrap normal deve executar
somente `prisma migrate deploy`.

Não existe baseline automático. `prisma migrate resolve` não faz parte do
startup, deploy ou recuperação automática.

O `_prisma_migrations` de produção contém um registro conhecido sem pasta no
repositório — `20261001120000_add_product_reservations`, migration aplicada e
nunca commitada. O efeito dela já foi revertido por
`20261002000000_resolve_product_reservation_drift`; o registro foi mantido de
propósito como evidência do incidente e para impedir que um `migrate deploy`
futuro recrie a tabela. `migrate status` não reporta o caso. Histórico completo
em `EVOLUCAO-BACKEND-2026-09-29.md` §10.

### Registro a mais no banco local `agendai` (branch lateral de posts)

O `_prisma_migrations` do banco local `agendai` (dev) tem **126 linhas**; a pasta
`prisma/migrations/` e o banco `agendai_db` (testes) têm **125**. A linha a mais
é `20261027000000_post_media_gallery_default` — aplicada em 2026-10-27T03:35:52Z
(`applied_steps_count=1`, sem logs).

**Origem:** commit `bc33f9d` ("feat(posts): upload de mídia sempre entra na
galeria do perfil"), que existe **apenas na branch lateral
`feat/upload-galeria-cheia-sem-400`** e **não é ancestral de `main`**
(`git merge-base --is-ancestor bc33f9d HEAD` → falso). A pasta da migration não
foi removida do histórico — ela simplesmente nunca entrou na `main`.

**Estado atual do schema:** o efeito da migration (`post_media.inGallery` com
`DEFAULT true`) **não está no banco** — `information_schema` mostra
`column_default = false`, igual ao `schema.prisma` da `main`.

*Por que o default sumiu:* **provavelmente** um `db push` / re-sync de schema
posterior (drift corrigido, ver AGENTS.md §Drift) revertido o default sem mexer
em `_prisma_migrations`. **Isso NÃO foi verificado:** não existe log do `db push`
que reverteu o default nem data de quando isso aconteceu — é inferência, não
fato registrado. O que **foi** verificado: o default atual é `false` (igual ao
`schema.prisma` da `main`), a linha em `_prisma_migrations` existe desde
2026-10-27 e ninguém a removeu.

**Impacto verificado (2026-11-01):** `prisma migrate status` → "Database schema
is up to date!" em `agendai` e `agendai_db`; `prisma migrate diff --from-url …
--to-schema-datamodel` → **vazio** nos dois. O Prisma só considera migrations
**pendentes** (pasta sem registro) — registro a mais no banco é ignorado. Nada
foi apagado (nenhum `DELETE` em `_prisma_migrations`).

**Antes de mergear `feat/upload-galeria-cheia-sem-400` na `main`:**

1. Conferir se a pasta `20261027000000_post_media_gallery_default/` entra na
   `main`. Se entrar, a `main` passa a ter uma migration que **já está aplicada**
   no `agendai` → em `staging`/produção ela rodará o SQL (o `SET DEFAULT true` e o
   backfill das 30 fotos são idempotentes, mas o default ficará `true`).
2. Decidir o efeito desejado: se a `main` **não** quer o default `true`, manter
   a migration fora da `main` (ou adjustar o SQL antes do merge, num commit
   próprio da branch).
3. Se a migration for mergeada e o SQL **não** puder ser alterado: nos bancos que
   já a têm aplicada, usar `prisma migrate resolve --applied` (não `DELETE`) para
   manter o registro; nos bancos novos, ela roda normalmente.
4. Nunca `DELETE` da tabela `_prisma_migrations` e nunca `migrate reset` para
   alinhar o histórico — o procedimento aprovado está em §Uso excepcional de
   `migrate resolve`.

## Dívida técnica: renomear as migrations com prefixo inconsistente (prazo 2026-12-31)

**Escopo real: 37 migrations.** O prefixo de data delas é **posterior ao dia em
que a pasta foi criada** (medido pelo commit que adicionou cada pasta,
`git log --diff-filter=A`). Isso quebra a leitura temporal do histórico: uma
migration "de 2026-11-05" que entrou no git em 2026-10-30.

Divisão do escopo:

| grupo | quantidade | situação |
|---|---|---|
| série `20261105`…`20261110` (prefixo > 2026-11-01) | **11** | já aplicadas em `agendai` e `agendai_db`; 2 delas (`20261110120000`, `20261110130000`) ainda **untracked** |
| migrations de `20260831`…`20260912` com o mesmo defeito | **26** | já aplicadas; podem ser renomeadas junto |
| linha excedente em `_prisma_migrations` do `agendai` | **1** | `20261027000000_post_media_gallery_default` (aplicada sem pasta) — ver §"Registro a mais no banco local `agendai`" |

Lista completa (prefixo | dia em que a pasta entrou no git):

```
20260831000000_seed_default_plans|2026-08-30
20260831010000_restore_subscription_unique_constraint|2026-08-30
20260831020000_defer_plan_activation_until_payment|2026-08-30
20260831030000_add_service_commissions|2026-08-30
20260904000000_products_sku_barcode_unique|2026-09-03
20260909000000_add_cash_movement|2026-09-08
20260909000001_extend_daily_closeout|2026-09-08
20260909010000_add_loyalty|2026-09-08
20260909020000_add_professional_goals|2026-09-08
20260909030000_add_cashback|2026-09-08
20260909040000_add_rls_v11_v12|2026-09-08
20260910000000_add_deposit_policy|2026-09-08
20260910000001_add_appointment_deposits|2026-09-08
20260910000002_add_waitlist|2026-09-08
20260910000003_add_memberships|2026-09-08
20260910000004_extend_appointments_and_clients|2026-09-08
20260910000005_add_rls_v13|2026-09-08
20260911000001_add_showcase|2026-09-09
20260911000002_add_advanced_catalog|2026-09-09
20260911000003_add_visit_tab|2026-09-09
20260911000004_add_client_portal_showcase|2026-09-09
20260911000005_add_remaining_modules|2026-09-10
20260911000006_add_e5_f1_f7|2026-09-10
20260912000001_add_gift_cards_resources_profit_organizations|2026-09-09
20260912000002_fix_resource_booking_start_at_type|2026-09-09
20260912000003_add_client_procedure_records|2026-09-11
20261105120000_data_import_phase2_targets|2026-10-30
20261105120100_data_import_phase2_stock_fiado_origin|2026-10-30
20261105120200_data_import_phase2_snapshots|2026-10-30
20261105120300_data_import_phase2_mixed_target|2026-10-30
20261106120000_data_export_jobs|2026-10-30
20261106120100_data_export_pdf_format|2026-10-30
20261107120000_whatsapp_ai_realtime|2026-10-31
20261108120000_platform_whatsapp_settings|2026-10-31
20261109120000_crm_backfill_run_scope|2026-11-01
20261110120000_import_batch_source|(untracked)
20261110130000_import_file_formats|(untracked)
```

**Renomear para o dia real preserva a ordem relativa dos prefixos** — é
obrigatório manter a ordem relativa (não basta trocar a data: os prefixos
precisam continuar monotônicos, porque o Prisma ordena pelo nome da pasta).

Procedimento e passos de verificação: `AGENTS.md` §"Dívida técnica — renomear
as migrations com prefixo inconsistente". Enquanto a dívida não for paga, vale
a regra do passo 1 de `AGENTS.md` §"migrations com timestamp futuro" (prefixo
novo > maior prefixo da pasta). Nada trava — é higiene de histórico.

## Invariantes

- Nunca usar `prisma db push` fora de desenvolvimento descartável.
- Ao operar o Prisma na mão, definir `DATABASE_URL` **e** `DIRECT_URL`. O
  `schema.prisma` declara as duas para o mesmo datasource; sobrescrever só uma
  faz o comando ir parar no banco do `.env`, não no alvo pretendido (incidente
  de 2026-10-02). Nos `.env` os valores vêm entre aspas — removê-las ao copiar,
  senão o Prisma responde `P1013: scheme not recognized`.
  - **`migrate diff --from-schema-datasource` também segue o `directUrl`.** Ele
    conecta no banco do `.env` mesmo com `DATABASE_URL` apontando para o alvo
    local, e devolve um resultado plausível porém do banco errado. Conferir o
    alvo com `migrate status` (que imprime o datasource) antes de confiar no
    diff — ambos só respeitam o alvo quando as duas variáveis estão setadas.
  - A forma correta é `--from-schema-datasource <caminho do schema>`, com o
    caminho explícito; sem argumento o CLI acusa `option requires argument`.
- Apenas o processo `PROCESS_ROLE=api` pode receber `RUN_MIGRATIONS=true`.
- Worker e scheduler usam sempre `RUN_MIGRATIONS=false`.
- Exatamente uma instância da API executa migrations durante o deploy.
- Uma falha de migration interrompe o startup; não iniciar a aplicação com
  schema potencialmente incompleto.
- Não editar uma migration que já tenha sido aplicada. Criar outra migration.
- **`DEFAULT` que o Prisma 6.4 não emite:** o datamodel não gera `DEFAULT`
  para `@default(uuid())` nem para `@updatedAt`. Quando uma migration escrita à
  mão cria esses defaults (caso de `20261002000001_add_verified_reviews` e
  `20261002000003_add_referral_credit_ledger`), o
  `migrate diff --from-schema-datasource … --to-schema-datamodel` acusa drift
  **permanentemente** e qualquer `migrate dev` regeraria o mesmo drop. Corrigir
  com uma migration nova de `ALTER TABLE … ALTER COLUMN … DROP DEFAULT` — nunca
  editando a aplicada (resolvido por `20261003000002_align_prisma_defaults`).
  Antes de derrubar o default de `updatedAt`, confirmar que nenhum SQL raw
  insere na tabela sem aquela coluna: nesta base 68/68 `updatedAt` já operam
  sem default e todo acesso é via Prisma client, que fornece o valor.
- **Para aplicar uma migration pontual sem levar junto o WIP alheio:** mover a
  pasta indesejada para fora de `prisma/migrations/`, rodar `migrate deploy` e
  devolver a pasta em seguida (procedimento de 2026-10-03, usado para aplicar
  `20261003000001` sem promover `20261002000004`, que pertence a outra sessão).
  A pasta só pode ser removida se a migration correspondente **ainda não** estiver
  no `_prisma_migrations` do alvo.
- Mudanças destrutivas exigem expand/contract e rollback de aplicação compatível.

## Fluxo de deploy

### 1. Preparação

1. Confirmar CI verde, inclusive Gitleaks, `prisma validate`, deploy em banco
   vazio, `migrate status` e `migrate diff`.
2. Confirmar que a migration foi aplicada em staging e que o smoke passou.
3. Criar backup `pg_dump --format=custom` e registrar seu identificador.
4. Para migrations destrutivas, validar previamente as guardas e o plano de
   restauração.

Exemplo de backup, sem colocar credenciais na linha de comando:

```bash
export PGHOST='<host>' PGPORT='5432' PGUSER='<user>' PGDATABASE='<database>'
pg_dump --format=custom --file="backup_pre_deploy_$(date +%Y%m%d_%H%M%S).dump"
```

Forneça a senha por mecanismo seguro do provedor ou `PGPASSFILE`; não registre
URLs com senha em tickets, logs ou histórico do shell.

### 2. Pré-validação

Em staging e produção:

```bash
npx prisma validate
npx prisma migrate status
```

Em operação manual fora do container, aponte as duas variáveis para o mesmo
alvo antes de qualquer comando — sem imprimir os valores:

```powershell
$alvo = '<url do banco de destino>'
$env:DATABASE_URL = $alvo; $env:DIRECT_URL = $alvo
npx prisma migrate status
```

`migrate status` pode indicar migrations pendentes, mas não pode indicar
migration falha, divergente ou ausente no repositório.

Para inspecionar drift sem imprimir SQL ou dados do banco:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

O código `0` significa ausência de diferença; `2` significa que existe drift e
o deploy deve ser interrompido para investigação.

### 3. Aplicação

O container da API aplica a migration pelo entrypoint quando configurado assim:

```text
PROCESS_ROLE=api
RUN_MIGRATIONS=true
```

Não configure Start Command no Render: utilize o `ENTRYPOINT` e o `CMD` da
imagem. Worker e scheduler devem permanecer com `RUN_MIGRATIONS=false`.

O comando executado é estrito:

```bash
npx prisma migrate deploy
```

Se falhar, o processo encerra com status diferente de zero. Não reinicie com
flags de bypass e não marque migrations como aplicadas para liberar o deploy.

### 4. Pós-validação

```bash
npx prisma migrate status
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

Depois valide `/ready`, `/health` e os smokes de autenticação, trial, pagamento,
fila, agenda pública e fechamento de atendimento.

Registre commit, migration aplicada, horário, backup e resultado do smoke.

## Uso excepcional de `migrate resolve`

`prisma migrate resolve` é uma ferramenta manual de reparo, não de bootstrap.
Só pode ser usado quando todos estes itens forem verdadeiros:

1. há incidente formal e responsável humano identificado;
2. existe backup restaurável;
3. o conteúdo SQL e o checksum da migration foram revisados;
4. evidência estrutural comprova que o banco já contém exatamente a mudança;
5. o comando e seu efeito foram ensaiados em clone sanitizado;
6. a aprovação foi registrada no ticket do incidente.

Exemplo deliberadamente incompleto:

```bash
# INCIDENTE APROVADO APENAS — não copiar para startup ou CI
npx prisma migrate resolve --applied <migration_exatamente_verificada>
```

Nunca executar um loop de `resolve`, nunca usar `|| true` e nunca inferir que
todo erro `migrate deploy` seja P3005.

## Falhas e recuperação

- Migration falhou antes de alteração: corrigir a causa e repetir o deploy.
- Migration parcialmente aplicada: interromper rollout, preservar logs
  sanitizados e seguir o procedimento oficial do Prisma para a migration exata.
- Aplicação incompatível após migration aditiva: voltar a versão da aplicação;
  não reverter schema automaticamente.
- Migration destrutiva aplicada: bloquear novas escritas e executar o plano de
  restauração aprovado para aquela migration.
- Drift detectado: não usar `db push`; gerar diagnóstico, comparar com staging e
  criar migration corretiva versionada.

## Escala horizontal

Enquanto `RUN_MIGRATIONS=true` estiver no serviço API, mantenha uma única
instância durante a etapa de migration. Antes de escalar a API, conclua o deploy
e altere `RUN_MIGRATIONS=false`, ou use um job de pre-deploy único que execute o
mesmo entrypoint com `PROCESS_ROLE=api`.
