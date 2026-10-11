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
| 2 | `release/backend` | `main` | Abrir PR de merge-commit (sem squash apagando histórico, sem rebase) | ⬜ Pendente |
| 2.1 | — | — | Esse PR é o **primeiro** momento em que o CI roda nesta branch (ver R7) | ⬜ |
| 3 | — | — | `git push origin release/backend` (apenas `release/*`) | ⬜ Pendente |

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
| `INTERNAL_HEALTH_TOKEN` | **Sim** | `/internal/health` responde **401 sempre**, inclusive vindo de loopback (fail-closed). Health check de infraestrutura fica cego | ⚠️ **Gap: ausente do `.env.example`** |
| `ASAAS_WEBHOOK_TOKEN` (≥32 chars) | Sim, se `PAYMENT_PROVIDERS_ENABLED` inclui `ASAAS` (default em produção) | **O boot é recusado** (`assertWebhookConfig()`) | ⚠️ Risco de deploy-break |
| `MERCADOPAGO_WEBHOOK_SECRET` (≥32) | Sim, se `MERCADOPAGO` está habilitado | **O boot é recusado** | ⚠️ Risco de deploy-break |
| `ABACATEPAY_WEBHOOK_SECRET` (≥32) | Sim, se `ABACATEPAY` está habilitado | **O boot é recusado** | ⚠️ Risco de deploy-break |
| `ALLOW_INSECURE_WEBHOOKS` | **Não pode ser `true`** | Com `NODE_ENV=production` o boot é recusado se for `true` | ✅ Protegido por código |
| `PAYMENT_PROVIDERS_ENABLED` | Opcional | Default em produção: `["ASAAS"]` | ✅ Documentado |

---

## 4. Migrations

| Verificação | Resultado |
|---|---|
| `git diff origin/main -- prisma/migrations` | **Vazio** — nenhuma migration nova nesta release |
| `git diff origin/main -- prisma/schema.prisma` | **Vazio** — nenhum schema novo |
| Total de migrations | 92 |
| `npx prisma migrate deploy` em banco fresh | ✅ OK |
| `npm run db:migrate:status` | ✅ todas aplicadas |
| `npx prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma --exit-code` | ❌ exit 2 (drift) — **pré-existente em `main` também** |

Drift conhecido (não introduzido por esta release):

- `audit_logs.barbershop_id` → `barbershopId`
- defaults de `id` em `nps_responses`, `nps_surveys`, `owner_invites`

---

## 5. Riscos conhecidos

| # | Risco | Severidade | Evidência | Mitigação | Status |
|---|---|---|---|---|---|
| R1 | Job `secrets` do CI falha: **10 findings do Gitleaks** no histórico | Alta | Scan local `zricethezav/gitleaks:v8.24.3`, 321 commits, 10 leaks / 7 arquivos | Ver tabela abaixo. Reescrever histórico = proibido nesta tarefa | ❌ Não resolvido (reportado) |
| R2 | Job `backend` do CI **não roda** (`needs: secrets`) | Alta | CI `main` run `37497074211` falha em `Secret scan` | Resolver R1 ou separar o gate de secrets do job de build | ❌ Não resolvido |
| R3 | `prisma migrate diff --exit-code` = 2 em banco fresh | Média | Reproduzido em `release/backend` **e** em `origin/main` (`MAIN_DIFF_EXIT=2`) | `prisma db pull` + migration de correção num ticket próprio | ❌ Pré-existente |
| R4 | `INTERNAL_HEALTH_TOKEN` obrigatória em produção mas fora do `.env.example` | Média | `src/shared/infra/http/health.ts` (`isInternalHealthAuthorized`) | Adicionar ao `.env.example` antes do deploy | ⬜ Ação recomendada |
| R5 | `assertWebhookConfig()` **recusa o boot em produção** com provider habilitado e secret ausente/curto | Alta | `src/config/webhooks.ts`, chamado em `src/shared/infra/http/server.ts` | Conferir envs do provedor **antes** do deploy | ⬜ Ação recomendada |
| R6 | `warmupApiRedis()` só loga warning | Baixa | `src/shared/infra/queue/redisConnection.ts` | Nenhuma — é fail-open por design; auth de webhook continua fail-closed | ✅ Aceito |
| R7 | O workflow do backend só dispara em `push: branches: [main]` e `pull_request: branches: [main]` — **`release/backend` não gera run de CI** | Média | `.github/workflows/ci.yml` (linhas 3–8); nenhum run para a branch após o push | Abrir o PR de §2 é o que dispara o CI; a evidência local de §7 substitui o run até lá | ✅ Conhecido |

### R1 — findings do Gitleaks (10)

| Commit | Arquivo | Regra |
|---|---|---|
| `af94d4d730` | `.env` | `generic-api-key` |
| `7a8c4d8093` | `.env` | `generic-api-key` |
| `90b2a7ba40` | `.env` | `generic-api-key` |
| `4e775b5ed6` | `.github/workflows/ci.yml` | `generic-api-key` |
| `a3005fa7fe` | `scripts/seed-qa-fixture.ts` | `generic-api-key` |
| `1ee7c50413` | `src/modules/email/services/emailPreferenceService.spec.ts` | `generic-api-key` |
| `e68c786e36` | `src/tests/setup.ts` | `generic-api-key` |

Os 9 primeiros já estão em `origin/main`. O 10º (`a3005fa` — `DEFAULT_QA_PASSWORD` no seed QA) só existe em `release/backend`.

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

# 3) Migrations: só é preciso se a release tiver trazido migration nova.
#    NESTA release não há migration nova (ver §4), então nada a reverter em banco.
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
| 3 | `npm run test:unit` | 182 arquivos / 1624 testes | vitest run | ✅ |
| 4 | `npm run test:integration` | 8 arquivos / 42 testes | Postgres real em `:5442` | ✅ |
| 5 | `npm run test:security` | exit 0 | vitest run | ✅ |
| 6 | `npm run docs:check` | exit 0 | `scripts/check-docs.mjs` | ✅ |
| 7 | `npx prisma validate` | exit 0 | schema válido | ✅ |
| 8 | `npm run db:migrate:status` | 92 migrations aplicadas | `prisma migrate status` | ✅ |
| 9 | `npm ci --dry-run` | exit 0 | lockfile consistente | ✅ |
| 10 | `npm ls --depth=0` | exit 0 | sem dependências quebradas | ✅ |
| 11 | CI `secrets` (Gitleaks) | **10 findings** | scan local `zricethezav/gitleaks:v8.24.3` idêntico ao do CI | ❌ |
| 12 | CI `backend` | **não executado no CI** | job depende de `needs: secrets`; e a branch não dispara workflow (R7) | ⏭ |

### 7.2 Smoke test manual (pré-deploy)

| # | Item | Resultado | Prova | Status |
|---|---|---|---|---|
| 13 | `GET /health` responde 200 | — | curl no ambiente alvo | ⬜ |
| 14 | `GET /internal/health` **sem** `INTERNAL_HEALTH_TOKEN` em produção → 401 | — | curl + log | ⬜ |
| 15 | `GET /internal/health` **com** token válido → 200 | — | curl + log | ⬜ |
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
