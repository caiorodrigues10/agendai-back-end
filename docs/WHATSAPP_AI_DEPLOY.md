# Runbook — Atendente de IA no WhatsApp

Procedimento para colocar o atendente de IA (cliente final) em produção e
desfazer, se necessário.

## O que é

- Uma **instância Evolution própria** (`EVOLUTION_AI_INSTANCE_NAME`) recebe as
  mensagens do cliente final.
- A Evolution faz `POST` em `/api/webhooks/evolution/ai` com o header
  `x-webhook-secret: <EVOLUTION_WEBHOOK_SECRET>`.
- O backend enfileira em `whatsapp-ai` (BullMQ/Redis), processa, resolve o salão
  pelo número do cliente e responde na mesma instância.
- Cada salão liga/desliga o atendente em `Barbershop.whatsappAiEnabled`
  (toggle no painel → `PUT /api/barbershops/:id/ai/settings`).

> A instância da plataforma (`EVOLUTION_INSTANCE_NAME`) é do **assistente do
> dono** e é ignorada pelo atendente de IA. As duas não podem ser a mesma:
> senão os dois bots respondem a mesma mensagem.

## 1. Pré-requisitos

| Item | Valor |
|---|---|
| Instância Evolution da IA | nova, com um número próprio (não o do assistente do dono) |
| Segredo do webhook | `openssl rand -hex 32` (mínimo 32 caracteres) |
| Redis | disponível (fila `whatsapp-ai`) |
| Postgres | com as migrations aplicadas |

## 2. Variáveis de ambiente

```bash
EVOLUTION_API_URL="https://evolution.exemplo.com"
EVOLUTION_API_KEY="<token global da Evolution>"
EVOLUTION_INSTANCE_NAME="<instância da plataforma / assistente do dono>"
EVOLUTION_AI_INSTANCE_NAME="<instância do atendente de IA>"
EVOLUTION_WEBHOOK_SECRET="<32+ chars aleatórios>"
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
```

Confira antes de subir:

```bash
npm run whatsappai:check
```

O script falha (exit 1) se faltar item obrigatório, se o segredo tiver menos de
32 caracteres ou se a instância da IA for igual à da plataforma.

## 3. Banco de dados

```bash
npx prisma migrate deploy
```

A migration `20261107120000_whatsapp_ai_realtime` cria
`Barbershop.whatsappAiEnabled` (default `false`) e normaliza
`ai_conversations."normalizedPhone"` com prefixo 55.

Antes do primeiro deploy em produção/staging, compare histórico × banco (ver
`docs/RUNBOOK_MIGRATIONS.md`): bancos criados com `db push` precisam de baseline.

## 4. Webhook na Evolution

Na instância `EVOLUTION_AI_INSTANCE_NAME`:

```
POST {EVOLUTION_API_URL}/webhook/set/{EVOLUTION_AI_INSTANCE_NAME}
```

Headers:

```
Content-Type: application/json
x-webhook-secret: {EVOLUTION_WEBHOOK_SECRET}
```

Eventos: `messages.upsert`.

O endpoint do backend é `/api/webhooks/evolution/ai` (prefixo `/api` do app).

Regras do backend:

- segredo ausente → **503**; segredo errado → **401**;
- JID de grupo (`@g.us`) ou difusão (`@broadcast`) → ignorado;
- número com menos de 10 dígitos → ignorado;
- a mesma mensagem (`key.id`) não é processada duas vezes (dedupe de 24h no Redis).

## 5. Subida

```bash
npm run build
npm run start:prod   # roda prisma migrate deploy + sobe o processo
```

No boot, se `EVOLUTION_AI_INSTANCE_NAME` ou `EVOLUTION_WEBHOOK_SECRET` faltarem,
o processo loga um aviso (`Atendente de IA no WhatsApp desativado`).

## 6. Ativação por salão

```sql
UPDATE "Barbershop" SET "whatsappAiEnabled" = true WHERE id = '<uuid-do-salao>';
```

Ou pelo painel (Configurações → WhatsApp → *Atendente de IA no WhatsApp*).

## 7. Verificação

```bash
# 1) teste de mensagem pelo painel (não envia nada ao WhatsApp)
curl -X POST http://localhost:3333/api/barbershops/<id>/ai/process \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <token-do-dono>" \
  -d '{"phone":"11999990000","content":"qual o horário?"}'

# 2) webhook real (simula a Evolution)
curl -X POST http://localhost:3333/api/webhooks/evolution/ai \
  -H 'Content-Type: application/json' \
  -H "x-webhook-secret: $EVOLUTION_WEBHOOK_SECRET" \
  -d '{"event":"messages.upsert","instance":"<instancia-ia>","data":{"key":{"id":"1"},"message":{"from":"5511999990000@s.whatsapp.net","text":"oi"},"remoteJid":"5511999990000@s.whatsapp.net"}}'

# 3) painel
curl http://localhost:3333/api/barbershops/<id>/ai/conversations \
  -H "Authorization: Bearer <token-do-dono>"
```

## 8. Rollback

1. Desligar por salão: `UPDATE "Barbershop" SET "whatsappAiEnabled" = false;`
2. Remover o webhook na Evolution (`DELETE {EVOLUTION_API_URL}/webhook/set/{instancia}`).
3. Desligar o worker: `PROCESS_ROLE` sem `worker`/`all` no processo da API.
4. Reverter a migration (só se ninguém mais usa a tabela):

```bash
npx prisma migrate resolve --rolled-back 20261107120000_whatsapp_ai_realtime
npx prisma migrate deploy
```

Manter `EVOLUTION_AI_INSTANCE_NAME` no env é seguro: sem `whatsappAiEnabled`
nenhum salão é atendido.

## 9. Referências

- `src/modules/whatsappAi/` — módulo do atendente
- `src/shared/infra/queue/whatsappAiQueue.ts` / `whatsappAiWorker.ts` — fila
- `src/shared/services/evolutionWebhook.ts` — parser do webhook
- `docs/agents/BUSINESS_RULES.md` — regras do atendente de IA
