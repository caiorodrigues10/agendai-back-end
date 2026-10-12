# RELEASE PLAN — agendai-back-end

> Branch de entrega: **`release/backend`**
> Regras de push: somente branches `release/*`. `main` **nunca** é alterada por push/force.
> Este documento não contém segredos, tokens ou credenciais.

---

## 1. Composição da branch

| Item | Valor |
|---|---|
| Origem | `fix/financeiro-v2` (`cc9a1cd`) |
| Merge | `origin/main` → `release/backend` (commit `cfa98c3`) |
| Merge-base | `0633324` |
| Commits de `main` tragos | 7 (`8fbfd22`, `55c802b`, `6ded5ca`, `235bcfc`, `f00ea5c`, `a0783e1`, `7e496b7`) |
| Conflitos resolvidos | 2 (+1 ajuste de teste) — ver §5 |
| Ancestrais | `fix/seguranca` e `fix/qa-painel-admin` **já são** ancestrais de `fix/financeiro-v2` |
| Commits à frente de `origin/main` | 12 (até `2f2d02a`) |
| PR | [#2](https://github.com/caiorodrigues10/agendai-back-end/pull/2), **draft** |

> **Atenção (2026-10-12):** a `main` recebeu o merge da `fix/financeiro-v2`
> direto (`6fa45dd`) e está publicada no remoto — fora do plano original, que
> previa só PR. Por isso o PR #2 **não** é mais o veículo da financeiro-v2; ele
> entrega apenas os 12 commits listados acima (B1/B2/B7/B8b/B5 + docs).

Conflitos resolvidos:

| Arquivo | Resolução |
|---|---|
| `src/modules/queue/infra/repositories/QueueRepository.ts` | Mantida a assinatura de `main` (`Promise<{ item; createdFiadoId }>`) **e** o `rlsTransaction` da release (não `prisma.$transaction`) |
| `src/shared/infra/worker/postRenderPool.spec.ts` | Mantido `process.env.POST_RENDER_TIMEOUT_MS = "120000"` (exigido com vitest 4.1.11 instalado; `main` roda lock 4.0.18) |
| `src/tests/integration/queueAtomicity.spec.ts` | `expect(ok.status)` → `expect(ok.item.status)` (consequência da assinatura nova) — commit `78da835` |

---

## 2. Ordem de merge

| # | De | Para | Ação | Status |
|---|---|---|---|---|
| 1 | `origin/main` | `release/backend` | Merge de integridade (já feito, `cfa98c3`) | ✅ Feito |
| 2 | — | — | `git push origin release/backend` (apenas `release/*`) | ✅ Feito (`d48fa43..2f2d02a`) |
| 3 | `release/backend` | `main` | PR [#2](https://github.com/caiorodrigues10/agendai-back-end/pull/2) em **draft** (sem squash apagando histórico, sem rebase) | ✅ Aberto |
| 4 | `release/backend` | `main` | **Merge** — só depois da rotação dos 6 segredos de `.env` (ver R1) | ⛔ Bloqueado |

Regras:

- `main` só recebe conteúdo via PR. Nenhum push direto em `main`.
- Nada de `--force` em nenhum remoto.
- Se `main` avançar antes do merge: repetir o passo 1 (novo merge de `origin/main` em `release/backend`) e revalidar os checks de §7.

---

## 3. Variáveis de ambiente

### 3.1 Novas nesta release (documentadas em `.env.example`)

| Env | Obrigatória? | Default | Efeito se ausente | Status |
|---|---|---|---|---|
| `LOGIN_RATE_LIMIT_MAX` | Não (dev/test) | 10/min | Ignorada fora de `development`/`test`. Em produção **não tem efeito** | ✅ Documentada |
| `TRUST_PROXY` | Não | desativado | Atrás de LB a API enxerga o IP do proxy: rate limit, lockout e audit log compartilham a cota de todos os clientes | ✅ Documentada |
| `ENABLE_API_DOCS` | Não | `false` em produção | `/docs` responde 404 em produção | ✅ Documentada |
| `API_DOCS_SERVER_URL` | Não | — | `servers[0].url` da documentação fica errado | ✅ Documentada |

### 3.2 Obrigatórias em produção **e não documentadas no `.env.example`**

| Env | Obrigatória em produção? | Efeito se ausente | Status |
|---|---|---|---|
| `INTERNAL_HEALTH_TOKEN` | **Sim** | `/internal/health` responde **401 sempre**, inclusive vindo de loopback (fail-closed). Health check de infraestrutura fica cego | ✅ Documentada (`a86d76a`) |
| `ASAAS_WEBHOOK_TOKEN` (≥32 chars) | Sim, se `PAYMENT_PROVIDERS_ENABLED` inclui `ASAAS` (default em produção) | **O boot é recusado** (`assertWebhookConfig()`) | ⚠️ Risco de deploy-break |
| `MERCADOPAGO_WEBHOOK_SECRET` (≥32) | Sim, se `MERCADOPAGO` está habilitado | **O boot é recusado** | ⚠️ Risco de deploy-break |
| `ABACATEPAY_WEBHOOK_SECRET` (≥32) | Sim, se `ABACATEPAY` está habilitado | **O boot é recusado** | ⚠️ Risco de deploy-break |
| `ALLOW_INSECURE_WEBHOOKS` | **Não pode ser `true`** | Com `NODE_ENV=production` o boot é recusado se for `true` | ✅ Protegido por código |
| `PAYMENT_PROVIDERS_ENABLED` | Opcional | Default em produção: `["ASAAS"]` | ✅ Documentado |

> `INTERNAL_HEALTH_TOKEN` deixou de ser gap em `a86d76a`. Prova viva (Fastify
> real em socket, `NODE_ENV=production`): sem token → **401**, token errado →
> **401**, token válido → **200**.

---

## 4. Migrations

| Verificação | Resultado |
|---|---|
| `git diff origin/main -- prisma/schema.prisma` | **Vazio** — nenhum schema novo |
| `git diff origin/main -- prisma/migrations` | 1 diretório novo: `20261011000000_fix_audit_logs_column_and_id_defaults` (`9f8a7ee`) |
| `npx prisma migrate deploy` em banco fresh (`ci_fresh`, `ci_main`) | ✅ OK, idempotente (reexecução exit 0) |
| `npm run db:migrate:status` | ✅ todas aplicadas |
| `npx prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma --exit-code` | ✅ **exit 0** — `No difference detected.` |

A migration nova **corrige** o drift que a versão anterior deste documento
listava como conhecido:

- `audit_logs.barbershop_id` → `barbershopId` (rename + índice, via DO block idempotente)
- defaults `gen_random_uuid()` removidos de `nps_responses`, `nps_surveys`, `owner_invites`
  (`@default(uuid())` é client-side; o default de banco sobrava)

Prova de regressão: `src/tests/integration/auditLogColumn.spec.ts` — antes falhava
com `The column barbershopId does not exist in the current database.`, agora 2/2.

---

## 5. Riscos conhecidos

| # | Risco | Severidade | Evidência | Mitigação | Status |
|---|---|---|---|---|---|
| R1 | Job `secrets` do CI falha: findings do Gitleaks no histórico | Alta | CI `main` run `38193058581`: **10**; nesta branch: **7** | Allowlist por caminho p/ teste/CI (`adefdce`) + senha do fixture só de env (`2efb4c5`) reduziram 10→7. Os 7 restantes exigem **rotação**; rascunho por fingerprint pronto em `docs/security/gitleaksignore.draft` | ⛌ Bloqueado na rotação |
| R2 | Job `backend` do CI **não roda** (`needs: secrets`) | Alta | Run `38193058581`: `Secret scan` failure → `Backend and migration integrity` skipped | Resolver R1 destrava o job | ⛌ Bloqueado em R1 |
| R3 | `prisma migrate diff --exit-code` = 2 em banco fresh | Média | Reproduzido antes em `release/backend` e `origin/main` | **Resolvido** por `9f8a7ee` — agora exit 0 | ✅ Resolvido |
| R4 | `INTERNAL_HEALTH_TOKEN` obrigatória em produção mas fora do `.env.example` | Média | `src/shared/infra/http/health.ts` (`isInternalHealthAuthorized`) | **Resolvido** em `a86d76a` | ✅ Resolvido |
| R5 | `assertWebhookConfig()` **recusa o boot em produção** com provider habilitado e secret ausente/curto | Alta | `src/config/webhooks.ts:52` via `src/shared/infra/http/server.ts:52` | Prova viva abaixo — a recusa é real e o caminho seguro sobe. Conferir `PAYMENT_PROVIDERS_ENABLED` e o segredo de cada provedor **antes** do deploy | ✅ Verificado |
| R6 | `warmupApiRedis()` só loga warning | Baixa | `src/shared/infra/queue/redisConnection.ts` | Nenhuma — é fail-open por design; auth de webhook continua fail-closed | ✅ Aceito |
| R7 | O workflow do backend só dispara em `push: branches: [main]` e `pull_request: branches: [main]` — **`release/backend` não gera run de CI** | Média | `.github/workflows/ci.yml` (linhas 3–8) | O PR #2 dispara o CI; a evidência local de §7 substitui o run até lá | ✅ Conhecido |
| R8 | `GET /barbershops` e `GET /barbershops/:id` (sem autenticação) devolviam `evolutionInstanceName` | Alta | `barbershops.routes.ts` + `shopSelect` em `BarbershopRepository.ts` | **Resolvido** em `5bded23`: `publicShopSelect` sem o campo nas rotas públicas | ✅ Resolvido |

### R1 — findings do Gitleaks

**De 10 para 7.** Os 3 resolvidos nesta branch (teste/CI, não credencial real):

| Commit | Arquivo | O que era | Status |
|---|---|---|---|
| `e68c786e36` | `src/tests/setup.ts` | `JWT_SECRET` literal de teste | ✅ allowlistado por caminho (`adefdce`) |
| `1ee7c50413` | `src/modules/email/services/emailPreferenceService.spec.ts` | `EMAIL_UNSUBSCRIBE_SECRET` literal de teste | ✅ allowlistado por caminho (`adefdce`) |
| `a3005fa7fe` | `scripts/seed-qa-fixture.ts` | `DEFAULT_QA_PASSWORD` fixo no código | ✅ removido — só env (`2efb4c5`) |

**Os 7 restantes são credencial real e NÃO foram allowlistados de propósito:**

| Commit | Arquivo:linha | Env | Provedor |
|---|---|---|---|
| `90b2a7ba40` | `.env:15` | `ZAPI_INSTANCE_ID` | Z-API |
| `90b2a7ba40` | `.env:17` | `ZAPI_CLIENT_TOKEN` | Z-API |
| `7a8c4d8093` | `.env:18` | `EVOLUTION_API_KEY` | Evolution |
| `af94d4d730` | `.env:20` | `ASAAS_WEBHOOK_TOKEN` | Asaas |
| `af94d4d730` | `.env:26` | `ZAPI_INSTANCE_ID` | Z-API |
| `af94d4d730` | `.env:28` | `ZAPI_CLIENT_TOKEN` | Z-API |
| `a3005fa7fe` | `scripts/seed-qa-fixture.ts:33` | histórico do seed (`DEFAULT_QA_PASSWORD`) | — |

Rotação **é obrigatória** antes de qualquer ignore. Depois dela:

```bash
git mv docs/security/gitleaksignore.draft .gitleaksignore
git commit -m "ci(secrets): ignora fingerprints historicos ja rotacionados"
```

O draft já está validado contra `zricethezav/gitleaks:v8.24.3` (mesma imagem do CI):
com ele na raiz o scan volta a `no leaks found`. Ele **não** está aplicado.

Reprodução:

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.24.3 detect --source=/repo --no-banner --exit-code=0
```

---

## 6. Rollback

```bash
# 1) Voltar a main para o commit anterior ao merge do PR
git fetch origin
git checkout main
git reset --hard <sha-anterior-ao-merge>

# 2) Desfazer o push da branch de entrega (se necessário e só em release/*)
git push origin --delete release/backend

# 3) Migrations: esta release traz UMA migration nova
#    (20261011000000_fix_audit_logs_column_and_id_defaults, idempotente).
#    Ela só renomeia coluna e remove defaults — não há dados a reverter.
#    Se ainda não aplicada no ambiente alvo, nada a fazer.
npx prisma migrate status   # confirma o estado antes de qualquer ação
```

Se a release anterior era estável, o rollback de código é suficiente. Se R5 derrubou o boot, o rollback de código devolve o comportamento anterior imediatamente.

---

## 7. Checklist de smoke test

Ambiente de verificação: macOS local, Node 24, Postgres em `localhost:5442`, Redis em `localhost:6380`. Nenhum ambiente de produção foi tocado. `ledger:backfill --apply` **não foi executado**.

### 7.1 Verificações automatizadas (executadas nesta branch)

| # | Item | Resultado | Prova | Status |
|---|---|---|---|---|
| 1 | `npm run typecheck` | exit 0 | `tsc --noEmit` sem erros | ✅ |
| 2 | `npm run build` | exit 0 | build de produção concluído | ✅ |
| 3 | `npm run test:unit` | 182 arquivos / **1625** testes | vitest run | ✅ |
| 4 | `npm run test:integration` | 9 arquivos / **44** testes | Postgres real em `:5442` | ✅ |
| 5 | `npm run test:security` | exit 0 | vitest run | ✅ |
| 6 | `npm run docs:check` | exit 0 | `scripts/check-docs.mjs` | ✅ |
| 7 | `npx prisma validate` | exit 0 | schema válido | ✅ |
| 8 | `npm run db:migrate:status` | todas aplicadas | `prisma migrate status` | ✅ |
| 9 | `npm ci --dry-run` | exit 0 | lockfile consistente | ✅ |
| 10 | `npm ls --depth=0` | exit 0 | sem dependências quebradas | ✅ |
| 11 | `npx prisma migrate diff --exit-code` | **exit 0** | `No difference detected.` em `ci_fresh` | ✅ |
| 12 | CI `secrets` (Gitleaks) | **7 findings** (eram 10) | scan `zricethezav/gitleaks:v8.24.3` com `--redact` | ⛌ Rotação pendente |
| 13 | CI `backend` | **skipped** | `needs: secrets`; destravado ao resolver R1 | ⛌ |

### 7.1.1 Testes novos nesta branch

| Spec | O que prova | Resultado |
|---|---|---|
| `src/tests/integration/auditLogColumn.spec.ts` | drift de `audit_logs.barbershopId` não volta | 2/2 |
| `scripts/seed-qa-fixture.spec.ts` | senha `[QA]` só vem de env | 6/6 |
| `src/tests/integration/publicShopSelect.spec.ts` | rotas públicas sem `evolutionInstanceName`; `findById` preservado | 3/3 |
| `src/tests/integration/queueConcurrency.spec.ts` | conclusão simultânea não duplica ledger | 2/2 |

### 7.1.2 Prova viva de R5 — recusa de boot em produção

`assertWebhookConfig()` é chamado no **import** de `src/shared/infra/http/server.ts:52`,
antes de abrir conexão com banco ou fila. Testado contra o entrypoint real
(`npx tsx src/shared/infra/http/server.ts`), com `NODE_ENV=production`:

| Cenário | exit | Mensagem |
|---|---|---|
| `ASAAS` habilitado, token de 5 chars | 1 | `ASAAS_WEBHOOK_TOKEN muito curto (5 < 32 caracteres).` |
| `MERCADOPAGO` habilitado, secret ausente | 1 | `MERCADOPAGO_WEBHOOK_SECRET ausente em produção (provedor MERCADOPAGO habilitado).` |
| `ALLOW_INSECURE_WEBHOOKS=true` | 1 | `ALLOW_INSECURE_WEBHOOKS=true em produção — o bypass desliga a validação de assinatura dos webhooks.` |
| `ASAAS,ABACATEPAY`, só o do ASAAS presente | 1 | `ABACATEPAY_WEBHOOK_SECRET ausente em produção (provedor ABACATEPAY habilitado).` |
| `ASAAS` habilitado, token ≥ 32, sem bypass | — | **sobe**: `Server listening at http://0.0.0.0:3998`, zero ocorrências de "insegura em produção" |

As mensagens citam o **nome** da variável e o comprimento — nunca o valor.
A última linha da tabela é o que importa para o deploy: a trava é seletiva,
não quebra quem está configurado corretamente.

O que o operador precisa ter pronto **antes** de subir com `NODE_ENV=production`:

| Env | Regra |
|---|---|
| `PAYMENT_PROVIDERS_ENABLED` | lista dos provedores realmente em uso (`MERCADOPAGO`, `ASAAS`, `ABACATEPAY`) |
| `MERCADOPAGO_WEBHOOK_SECRET` / `ASAAS_WEBHOOK_TOKEN` / `ABACATEPAY_WEBHOOK_SECRET` | obrigatório para **cada** provedor da lista, ≥ 32 caracteres |
| `ALLOW_INSECURE_WEBHOOKS` | ausente ou `false` — `true` é sempre recusado |

Qualquer segredo presente, mesmo de provedor desabilitado, também é recusado
se tiver menos de 32 caracteres.

### 7.2 Smoke test manual (pré-deploy)

| # | Item | Resultado | Prova | Status |
|---|---|---|---|---|
| 13 | `GET /health` responde 200 | — | curl no ambiente alvo | ⬜ |
| 14 | `GET /internal/health` **sem** `INTERNAL_HEALTH_TOKEN` em produção → 401 | **401** ✅ | Fastify real em socket, `NODE_ENV=production` | ✅ Local (repetir no alvo) |
| 15 | `GET /internal/health` **com** token válido → 200 | **200** ✅ | idem; token errado → 401 | ✅ Local (repetir no alvo) |
| 16 | Boot da API com todas as envs de webhook preenchidas | — | log de startup sem `assertWebhookConfig` | ⬜ |
| 17 | Boot da API com `ASAAS_WEBHOOK_TOKEN` vazia em produção → **recusado** (esperado) | — | log de startup | ⬜ |
| 18 | Login de staff + sessão persiste após refresh | — | navegador real | ⬜ |
| 19 | Fila: concluir atendimento gera comissão e fiado | — | UI + banco | ⬜ |
| 20 | Agendamento público cria reserva e envia e-mail | — | fluxo público | ⬜ |
| 21 | Webhook Asaas assinatura processa e é idempotente | — | reenvio do mesmo webhook | ⬜ |
| 22 | Rate limit de login bloqueia e responde 423 progressivo | — | 11 tentativas | ⬜ |
| 23 | `ledger:backfill --apply` | **não executar nesta release** | — | ⛔ |

---

## 8. Ordem de deploy sugerida

1. Conferir/criar as envs de §3.2 no ambiente alvo.
2. Deploy do backend (esta branch).
3. Smoke test §7.2 itens 13–17 (saúde e boot).
4. Smoke test §7.2 itens 18–22 (fluxos de negócio).
5. Só então promover o frontend correspondente (`release/frontend`, ver plano do outro repositório).
