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
