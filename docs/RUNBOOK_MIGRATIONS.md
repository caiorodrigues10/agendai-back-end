# Runbook de migrations — staging e produção

## Estado conhecido

O banco de produção já está baselined: as migrations versionadas atuais possuem
registro concluído em `_prisma_migrations`. O bootstrap normal deve executar
somente `prisma migrate deploy`.

Não existe baseline automático. `prisma migrate resolve` não faz parte do
startup, deploy ou recuperação automática.

## Invariantes

- Nunca usar `prisma db push` fora de desenvolvimento descartável.
- Apenas o processo `PROCESS_ROLE=api` pode receber `RUN_MIGRATIONS=true`.
- Worker e scheduler usam sempre `RUN_MIGRATIONS=false`.
- Exatamente uma instância da API executa migrations durante o deploy.
- Uma falha de migration interrompe o startup; não iniciar a aplicação com
  schema potencialmente incompleto.
- Não editar uma migration que já tenha sido aplicada. Criar outra migration.
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
