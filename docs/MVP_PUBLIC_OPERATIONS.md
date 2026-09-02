# Operação do MVP público

## Gate de lançamento

O lançamento permanece bloqueado até a Asaas confirmar por escrito o escopo PCI do fluxo em que o backend recebe os dados do cartão. Em produção, configure `PAYMENT_PROVIDERS_ENABLED=ASAAS`; Mercado Pago e AbacatePay não devem ser expostos pela interface.

Antes de cada deploy:

1. CI do frontend e backend verde.
2. Backup PostgreSQL concluído e restauração mais recente validada.
3. `npx prisma migrate deploy` executado primeiro em staging.
4. Smoke comportamental verde em staging.
5. Deploy do backend, smoke, depois deploy do frontend.

## Staging isolado

Crie serviços Render separados para API, frontend, PostgreSQL e Redis. Nunca compartilhe banco, Redis, webhook ou credenciais Asaas com produção. Variáveis mínimas:

```text
NODE_ENV=production
APP_ENV=staging
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
- Se `/ready` falhar após migration, interrompa o frontend novo, restaure a versão anterior do backend e siga o procedimento específico da migration. Não reverta schema automaticamente quando houver escrita nova.

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
