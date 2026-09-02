# Operação do MVP público

## Gate de lançamento

O lançamento permanece bloqueado até a Asaas confirmar por escrito o escopo PCI do fluxo em que o backend recebe os dados do cartão. Em produção, configure `PAYMENT_PROVIDERS_ENABLED=ASAAS`; Mercado Pago e AbacatePay não devem ser expostos pela interface.

Antes de cada deploy:

1. CI do frontend e backend verde.
2. Backup PostgreSQL concluído e restauração mais recente validada.
3. Migration estrita executada pela única API de staging com
   `RUN_MIGRATIONS=true`.
4. Smoke comportamental verde em staging.
5. Deploy de uma instância da API de produção, smoke, workers/scheduler e,
   por último, frontend.

## Topologia de processos

A mesma imagem do backend atende três serviços, diferenciados por ambiente:

| Serviço | `PROCESS_ROLE` | `RUN_MIGRATIONS` | Responsabilidade |
|---|---|---|---|
| API | `api` | `true` durante o bootstrap | HTTP, webhooks e migration estrita |
| Worker | `worker` | `false` | Consumidores BullMQ |
| Scheduler | `scheduler` | `false` | Crons, lembretes e rotinas periódicas |

No Render, deixe o Start Command vazio para preservar o `ENTRYPOINT` da imagem.
Worker e scheduler só devem ser liberados depois que `/ready` da API estiver
saudável. Nunca use `PROCESS_ROLE=all` em produção.

Quando houver mais de uma instância da API, execute a etapa de migration em uma
única instância ou job de pre-deploy e depois use `RUN_MIGRATIONS=false` nas
réplicas. Falhas de `prisma migrate deploy` devem bloquear o rollout.

## Ativação do ledger de notificações

1. Gere duas chaves independentes de 32 bytes em Base64: uma para AES-GCM e
   outra para HMAC. Cadastre-as nos três serviços sem registrá-las em arquivo.
2. Publique inicialmente com `NOTIFICATION_V2_MODE=shadow`. O fluxo legado
   continua enviando e o novo ledger apenas registra; valide volume,
   deduplicação e isolamento por salão.
3. Confirme heartbeat do worker e do scheduler em
   `GET /api/admin/operations/notifications`.
4. Altere API, worker e scheduler para `NOTIFICATION_V2_MODE=active`. Nessa
   fase o outbox é a fonte de envio.
5. Configure o webhook Resend em `POST /api/webhooks/resend` com os eventos de
   envio, entrega, atraso, falha, bounce, reclamação, supressão, abertura e
   clique. O `RESEND_WEBHOOK_SECRET` deve ser o signing secret desse endpoint.

O payload criptografado é apagado após sete dias. Ao rotacionar, adicione a
nova versão ao keyring, torne-a ativa e mantenha a chave anterior até expirar o
último payload cifrado com ela.

## Staging isolado

Crie serviços Render separados para API, frontend, PostgreSQL e Redis. Nunca compartilhe banco, Redis, webhook ou credenciais Asaas com produção. Variáveis mínimas:

```text
NODE_ENV=production
APP_ENV=staging
PROCESS_ROLE=api
RUN_MIGRATIONS=true
PAYMENT_PROVIDERS_ENABLED=ASAAS
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
RECAPTCHA_SECRET_KEY=<staging>
SENTRY_DSN=<staging>
SENTRY_TRACES_SAMPLE_RATE=0.2
OTEL_ENABLED=true
DATABASE_URL=<postgres-staging>
REDIS_URL=<redis-staging>
```

Cadastre o webhook sandbox apontando exclusivamente para staging. O SQL `prisma/demo/crm_demo.sql` só pode ser carregado neste ambiente.

## Backup, restauração e rollback

- Backup diário: snapshot gerenciado do Render e `pg_dump --format=custom` criptografado fora do serviço.
- Restauração mensal: restaurar o último dump em um banco temporário, executar `prisma migrate status` e o smoke.
- Migrações destrutivas exigem estratégia expand/contract. Nunca use `db push` em produção.
- O banco de produção já está baselined; não execute baseline nem `migrate resolve` durante o startup.
- Se `/ready` falhar após migration, interrompa o frontend novo, restaure a versão anterior do backend e siga o procedimento específico da migration. Não reverta schema automaticamente quando houver escrita nova.
- Consulte `docs/RUNBOOK_MIGRATIONS.md` para pré-validação, reparo manual e escala horizontal.

## Smoke comportamental

```bash
node monitor-routes.js --url https://api-staging.exemplo.com --once
node monitor-routes.js --url https://api-staging.exemplo.com --once --token JWT --shop-id UUID --service-id UUID
```

O monitor exige status, formato do corpo e `X-Correlation-Id`; um `4xx` inesperado não é considerado sucesso.

## Auditoria de dados sensíveis

O comando abaixo nunca imprime valores:

```bash
npm run security:audit-logs
```

Depois de um backup verificado, faça a remediação:

```bash
CONFIRM_AUDIT_REMEDIATION=yes npm run security:audit-logs -- --apply
```

Registre contagem, horário, operador e identificador do backup no ticket de mudança.

## Alertas mínimos

- `/health` degradado ou `/ready` diferente de 200 por dois minutos;
- erro HTTP 5xx acima de 2% por cinco minutos e p95 acima de 1,5 s;
- webhook Asaas inválido, falhando ou sem processamento por dez minutos;
- cobrança `PENDING` além do prazo esperado;
- fila BullMQ WhatsApp com jobs parados/falhos;
- evento financeiro duplicado ou falha de backfill/reconciliação;
- Redis ou PostgreSQL indisponível.

Sentry deve usar um projeto por ambiente. O sanitizador remove corpo, cookies, autorização, cartões, documentos e tokens antes do envio.
