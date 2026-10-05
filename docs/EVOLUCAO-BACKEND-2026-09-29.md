# Evolução arquitetônica, performance e confiabilidade — Agenda Já Backend

> **Data:** 2026-09-29 · **Base:** grafo Graphify (2026-09-28) + 5 inventários de subagente + verificação manual do agente principal.
> **Escopo:** `agendai-back-end/`. Monólito modular, Supabase (PostgreSQL), Upstash (Redis), Render.
> **Números de performance são metas de engenharia, não medições.**

---

## 0. Correções aos pressupostos do plano original

O plano pressupunha fatos que **não se confirmaram**. Corrigidos antes de qualquer mudança estrutural:

| Pressuposto | Verificado | Evidência |
|---|---|---|
| "Existe migration corretiva local não rastreada pelo Git" | **Falso.** `git status --porcelain -uall -- prisma/` está limpo; FS == `git ls-files` (73/73) | `git -C agendai-back-end status` |
| `20260919000000_equipment_movement_set_null` pendente | **Commitada** no commit `30acc4c` (2026-09-19) | `prisma/migrations/20260919000000_*/migration.sql` |
| Repo raiz é um repositório Git | **Não.** O repo real é `agendai-back-end/.git`; `D:\programação\agendai` não é git | `git status` na raiz → *fatal: not a git repository* |
| "Políticas versionadas" de RLS | **Não existe `tenant_version`.** Versionamento é só pelo nome do diretório de migration | busca em `prisma/migrations/**` → 0 ocorrências |
| Separação API/worker/scheduler "já existe" | Existe **lógica** (`PROCESS_ROLE`) e em compose (`docker-compose.prod.yml:12-51`), mas **não há `render.yaml`** — a topologia implantada no Render não é declarável a partir do repo | glob `render*.{yaml,yml,json,toml}` → 0 |
| Drift de banco de dev | **Confirmado e documentado** no AGENTS.md (P3005, `RUN_MIGRATIONS=false` no compose dev) | `AGENTS.md` §Riscos |

**Consequência:** a Fase 1 começa por medição de ambiente, não por correção estrutural. Nenhuma migration nova deve ser criada antes de `prisma migrate status` contra o banco real.

---

## 1. Diagnóstico verificado (estado atual)

Achados estáticos confirmados pela leitura direta do código. **Nenhum deles é, por si só, prova de lentidão em produção.**

### 1.1 P0 — integridade e isolamento

| # | Achado | Evidência | Impacto |
|---|---|---|---|
| **P0-1** | **Fallback de idempotência está quebrado:** `create` recebe a *função* `requestFingerprint` em vez do hash | `src/shared/services/idempotencyService.ts:66` (valor correto calculado em `:45`) | Toda requisição que cai no fallback com chave inédita responde **503 `IDEMPOTENCY_UNAVAILABLE` sem executar a operação**. O caminho de banco nunca cria registro. |
| **P0-2** | **Reexecução de cobrança:** se `SET <key>:result` falhar depois de `operation()` ter rodado, o `catch` cai no fallback e **chama `operation()` de novo** | `idempotencyService.ts:126-127 → 132 → 135 → 80`; lock já liberado no `finally` `:129-131` | Segunda execução da mesma cobrança sem confirmação do resultado da primeira. **Regra do plano ("falha ao salvar no Redis não autoriza repetir") violada hoje.** |
| **P0-3** | **Caminho Redis nunca valida fingerprint** (só o de banco calcula, `:45`) | `idempotencyService.ts:117-118` | Mesma chave + payload diferente → replay silencioso do cache, sem 409 `PAYLOAD_MISMATCH`. |
| **P0-4** | **Tenant vazio = acesso amplo:** extensão faz `barbershopId = getStore() ?? ""` e `set_config(..., "", TRUE)`; policies usam `COALESCE(...) = '' OR ...` | `src/libs/prismaExtensions.ts:34,39-41`; `prisma/migrations/20260827190000_fix_rls_unset_guc/migration.sql:14-15` | Sem store → **todas as linhas liberadas**. Documentado de propósito (`prismaExtensions.ts:17-18`) mas é autorização implícita. |
| **P0-5** | **3 rotas sem `setRlsContext`** rodam sempre com tenant `''` | `src/modules/wallet/wallet.routes.ts:8-37`, `src/shared/infra/http/routes/contact.routes.ts:8`, `emailGallery.routes.ts:155,186` | Acesso amplo por RLS nessas rotas. |
| **P0-6** | **44 models com `barbershopId` sem policy RLS** (agenda/financeiro/estoque incluídos: `visits`, `visit_tabs`, `profit_*`, `commission_entries`, `equipment*`) | diff `prisma/schema.prisma` × `prisma/migrations/**` | Isolamento 100% dependente do `WHERE` escrito à mão. |
| **P0-7** | **Role efetiva não verificada:** se a app usa `postgres.<ref>` (superuser/BYPASSRLS), todo o RLS é ignorado mesmo com `FORCE` | `.env` (user do pooler); nenhum `BYPASSRLS`/role no repo | **Hipótese de isolamento nulo.** Verificação obrigatória antes de qualquer refactor de RLS. |
| **P0-8** | **Transação por operação:** a extensão abre `$transaction` interativa em 100% das operações de modelo | `prismaExtensions.ts:37-49` | +1 BEGIN/COMMIT por query; multiplica espera do pool (máx. **10 conexões por processo**, `prismaClient.ts:22`). |
| **P0-9** | **Prisma exportado como `any`** | `src/libs/prismaClient.ts:32` (`export const prisma: any`) | Erros de persistência escapam do TypeScript em ~96 arquivos. |
| **P0-10** | **Webhooks sem registro durável/dedup** nos 3 provedores; sem guarda de ordem; MP engole falha de consulta e responde 200 | `ProcessWebhookUseCase.ts:27-32,37`; `PaymentRepository.ts:141-171` | Sem auditoria, sem replay, evento perdido silencioso, regressão `approved → cancelled` possível. |

### 1.2 P0 — limites e degradação

| # | Achado | Evidência | Impacto |
|---|---|---|---|
| **P0-11** | **Rate limit com contrato errado:** o plugin chama `store.incr(key, cb, **max**, ban)`, mas o store trata o 3º arg como `timeWindow` | `node_modules/@fastify/rate-limit/index.js:217` × `redisRateLimitStore.ts:15-21` | `ttl = ceil(max/1000)` → **janela efetiva de 1 segundo** em todos os limites (global 400, login 10, webhook 100). Proteção real: 400 req/s, não 400/min. |
| **P0-12** | **Prefixo por rota nunca é aplicado:** `child()` calcula `prefix` (`:58-68`) mas `incr` usa `key` cru (`:24`) | `redisRateLimitStore.ts:11,24,58-68` | Global e por-rota compartilham a **mesma chave** (`req.ip`) → contadores colidem. |
| **P0-13** | **Fail-open no rate limit** e em brute-force/forgot-password/cota WhatsApp | `redisRateLimitStore.ts:32-35`; `bruteForceProtection.ts:52,89`; `ForgotPasswordUseCase.ts:58-60` | Redis fora ⇒ limite e trava de login param de valer. |
| **P0-14** | **INCR → EXPIRE → TTL não atômicos** | `redisRateLimitStore.ts:23-31` | Chave pode nascer sem TTL; custo 3 round-trips por request. |
| **P0-15** | **Sem `trustProxy`** no `fastify()` | `app.ts:22-25` | Atrás de LB, toda a cota é do IP do proxy (compartilhada por todos os clientes). |

### 1.3 P1 — trabalho desnecessário e previsibilidade

| # | Achado | Evidência |
|---|---|---|
| P1-1 | Dispatcher de outbox com **polling fixo de 2 s** (não adaptativo), lote 25 | `notificationDispatcher.ts:10-12` |
| P1-2 | `NOTIFICATION_V2_MODE` default `disabled` e `PROCESS_ROLE` default divergente (`api` no entrypoint, `all` no TS) → worker/dispatcher/crons **não rodam** com defaults do `.env.example` | `.env.example:51,90`; `docker-entrypoint.sh:4`; `processRole.ts:6` |
| P1-3 | `CronRun` preso em `RUNNING` **sem reaper**; check em `cronLock.ts:57` impede re-execução → execução agendada perdida para sempre | `cronLock.ts:55-63,105-108` |
| P1-4 | **6 de 10 crons sem lock distribuído** (inclui `refundReconciliation`, `postPublisher`, `emailReminders`) | `server.ts:174-195` × uso de `withCronLock` |
| P1-5 | Reconciliação de estorno é **local-cega** (não consulta o provedor) e sem lock | `refundReconciliationService.ts:15-62` |
| P1-6 | **Fila sem paginação e sem índice**: `QueueRepository.list()` sem `take`; modelo `queue` sem índice em `(barbershopId, status, joinedAt)` | `QueueRepository.ts:58-72`; `schema.prisma:577-580` |
| P1-7 | **Dashboards com N queries:** 3 `count()` por slot (até ~90 em `period=1m`); 3 queries por salão no resumo admin (até ~300) | `AdminDashboardController.ts:97-113`; `AdminFinancialController.ts:197-244` |
| P1-8 | **Agregações financeiras em memória** (`findMany` + `reduce`) em resumo de despesas/fiado/caixa/insights/lucro | `BarbershopFinancialController.ts:89-156`; `ExpenseRepository.ts:128-134`; `FiadoRepository.ts:195-223`; `cashMovementRepository.ts:71-89` |
| P1-9 | Índices ausentes: `(barbershopId, referenceDate)` em expenses, `(barbershopId, status)` em fiados, `(date)` só em appointments, `name` em clients | `schema.prisma:1232-1236,1280-1284,660,741` |
| P1-10 | Ordenações paginadas **sem desempate por `id`** em 10+ listagens → offset instável | `AppointmentRepository.ts:123`, `SalonClientRepository.ts:223`, entre outros |
| P1-11 | **Health checks pesados:** `/health` e `/ready` consultam banco + Redis + leem `prisma/migrations` do FS a cada probe; **não há `/live`** | `health.ts:45-49,74-111` |
| P1-12 | **Shutdown incompleto:** sem `prisma.$disconnect()`, sem fechamento do `pg.Pool`, `postBroadcastWorker` não é parado, crons não têm `stop()` | `server.ts:121-137` |
| P1-13 | **Env não validado com Zod** no startup; `PROCESS_ROLE` inválido vira `all` com `console.warn` | `processRole.ts:7-9`; ausência de `envSchema` |
| P1-14 | Um único cliente Redis para API+workers+locks+rate limit, `maxRetriesPerRequest: null`, **sem `commandTimeout`** | `redisConnection.ts:29-38` |

### 1.4 P2 — observabilidade, CPU e realtime

| # | Achado | Evidência |
|---|---|---|
| P2-1 | Instrumentação OTel de Redis usa `instrumentation-redis-4` (node-redis) enquanto o código usa **ioredis** → no-op | `tracing.ts:7,29` × `redisConnection.ts:7` |
| P2-2 | Realtime entra em **single-instance permanente** após 1 falha de publish (sem retomada); `stop()` não fecha o publisher; limite só por salão | `realtimeService.ts:122-132,85-96,19` |
| P2-3 | Renderização de imagem (`@resvg/resvg-js`) síncrona **no handler HTTP** (preview/create/update de posts) | `postImageService.ts:428-438`; `PostsController.ts:191-395` |
| P2-4 | Treino de ML e exports CSV síncronos no handler | `analyticsController.ts:22-75`; `ExportFinancialDataUseCase.ts:30-44` |
| P2-5 | `KEYS` bloqueante (sem `SCAN`) | `bruteForceProtection.ts:126,155` |
| P2-6 | Chave BullMQ inexistente `bull:jobs:completed` → `deadJobs` sempre `[]` | `monitoringController.ts:33-35` |
| P2-7 | `subscriptionAccessCache` sem `try/catch` → Redis morto propaga exceção em `checkSubscription` | `subscriptionAccessCache.ts:19-33` |
| P2-8 | `Promise.all` sem teto em 4 pontos que crescem com dados | `AdminDashboardController.ts:97-113`, `AdminFinancialController.ts:197-244`, `GetOrganizationDashboardUseCase.ts:66-68`, `CrmController.ts:112` |

---

## 2. Matriz de dependências e fluxos críticos (Graphify)

Grafo: `agendai-back-end/graphify-out/` (13.256 nós, 29.703 arestas, 552 comunidades, atualizado 2026-09-28).
Workspace: `graphify-out/` atualizado em 2026-09-29 (`graphify update .`).

### 2.1 Caminhos críticos confirmados

```
FLUXO A — Cobrança (P0-1, P0-2, P0-3)
  executeIdempotent()  --imports-->  CreatePixPaymentController.ts  -->  CreatePixPaymentUseCase
  desce: redisConnection + prismaClient(idempotencyRecord)
  blast radius: payments.routes, subscriptions(SubscribeUseCase), trial-card

FLUXO B — Isolamento de tenant (P0-4..P0-8)
  setRlsContext()  --contains-->  setRlsContext.ts  -->  requestContext.ts  -->  prismaExtensions.ts
  desce: prisma (singleton any) → 96 repositórios
  blast radius: 499 nós em BFS depth=2 (todas as rotas autenticadas)

FLUXO C — Notificações transacionais
  notificationDeliveryService.ts  --imports_from-->  notificationWorker.ts
  grava: notificationDelivery + notification_outbox (mesma transação do domínio)
  consome: notificationDispatcher (poll 2 s) → BullMQ notifications-v2 → notificationWorker
  gate: NOTIFICATION_V2_MODE === "active"

FLUXO D — Fila/agenda (caminho mais quente)
  QueueRepository  --depth 2-->  container/index.ts, server.ts, createTestApp.ts
  sem índice (barbershopId,status,joinedAt) + sem take() → risco linear com histórico
```

### 2.2 Regras de dependência a preservar

**Rota → middleware → controller → caso de uso → repository/provider.**

| Área | Módulos reais mapeados |
|---|---|
| Identidade e acesso | `auth`, `users`, `barbershops`, middlewares `authenticate/authorize/setRlsContext/checkSubscription` |
| Operação | `appointments`, `queue`, `waitlist`, `deposits` |
| Clientes | `clients`, `crm`, `clientPortal` |
| Financeiro | `cash`, `financial` (closeout), `expenses`, `fiado`, `profit`, `commissions`, `BarbershopFinancialController` |
| Comércio | `products`, `purchasing`, `vouchers` |
| Plataforma | `subscriptions`, `plans`, `referrals`, `payments` |
| Comunicação | `notifications`, `email`, `posts`, `shared/infra/queue` |
| Administração | `admin`, `monitoring`, `analytics`, `copilot` |

Invariantes a não quebrar: um módulo não importa repositories internos de outro; regras puras não dependem de Fastify/Prisma/Redis; integrações usam contratos públicos ou eventos duráveis (outbox).

---

## 3. Backlog priorizado (Fase 1 — inventário)

Cada item tem **métrica de sucesso** e **critério de saída**. Ordem = prioridade real derivada da evidência, não a do plano original.

### P0 — corrigir antes de otimizar qualquer coisa

| ID | Item | Métrica de sucesso | Critério de saída |
|---|---|---|---|
| **B1** | Corrigir `idempotencyService.ts:66` (`requestFingerprint` → `fingerprint`) e **impedir reexecução** de `operation()` quando a gravação do resultado falhar | Teste de integração real (Postgres+Redis) cobrindo `executeWithDatabase`: criação, replay, `PAYLOAD_MISMATCH`, e "Redis falha após `operation()`" ⇒ **0 reexecuções** | Fase 2 do plano |
| **B2** | Validar fingerprint também no caminho Redis (`:117-118`) | Mesma chave + corpo diferente → 409 em **todos** os caminhos | Fase 2 |
| **B3** | Corrigir store de rate limit: 3º parâmetro = `max` (usar `this.timeWindow`), aplicar `prefix`, operação atômica (`INCR`+`PEXPIRE` em pipeline/Lua) | Janela efetiva = janela declarada; 1 round-trip; chave por rota isolada | Fase 4 |
| **B4** | Política de falha do rate limit: **fail-closed** para autenticação/pagamento, fail-open documentado só para leitura | Teste com Redis indisponível: login/pagamento recusados, leitura segue | Fase 4 |
| **B5** | Verificar **role efetiva** da app no Supabase (superuser/BYPASSRLS?) e grants | Relatório: role, `rolsuper`, `rolbypassrls`, `FORCE` efetivo, exposição da Data API | Fase 3 |
| **B6** | Mapear as 3 rotas sem `setRlsContext` + as 44 tabelas sem policy | Tabela decidida: cada acesso é `tenant`/`público`/`admin`/`sistema`, **sem tenant ausente como autorização** | Fase 3 |
| **B7** | `prisma migrate status` contra o banco real + conciliar histórico | 0 pendências, 0 drift não explicado; registro de quem aplicou o quê | Fase 1/15 |

### P1 — previsibilidade e custo por request

| ID | Item | Métrica de sucesso |
|---|---|---|
| B8 | Separar `/live` (sem dependências), `/ready` (deadline + resultado recente) e diagnóstico protegido | Probe não consulta migrations/FS; p95 do `/ready` ≤ 100 ms |
| B9 | Polling adaptativo do outbox (2 s com backlog → 30 s ocioso + jitter) | Comandos Redis/dia com fila vazia reduzidos ≥ 80% |
| B10 | Separar clientes Redis: API (falha rápida, `commandTimeout`) × workers × pub/sub | Falha de Redis não derruba nem trava a API |
| B11 | Lease/heartbeat + reaper para `CronRun RUNNING` órfão; lock nos 6 crons sem lock | Execução abandonada é retomada e auditada |
| B12 | Índice `(barbershopId, status, joinedAt)` em `queue` + `take()` na listagem | p95 de leitura de fila ≤ 400 ms com histórico grande |
| B13 | `orderBy` com desempate `id` nas 10+ listagens paginadas | 0 itens pulados/repetidos entre páginas |
| B14 | Agregar no banco (groupBy/aggregate) nos resumos financeiros, preservando semântica de parcial/estorno/fuso | Mesmo resultado em conjunto de casos de teste; memória ≤ orçamento |
| B15 | Reduzir N+1 de dashboard (3 queries/slot → agregação única; 3 queries/salão → batch) | Queries por request de dashboard ≤ 10 |
| B16 | Validar env com Zod no startup (números, limites, `PROCESS_ROLE`) | Boot falha rápido e com mensagem clara em config inválida |
| B17 | Shutdown completo: drenar requests/jobs, `prisma.$disconnect()`, fechar pool/Redis/realtime, parar `postBroadcastWorker` e crons | Teste de SIGTERM: 0 conexão órfã, 0 job perdido |
| B18 | Remover `any` do `prismaClient` por etapas (cliente estendido tipado) | `npm run typecheck` com o cliente tipado; erros de persistência viram erro de compilação |

### P2 — observabilidade e latência percebida

| ID | Item | Métrica de sucesso |
|---|---|---|
| B19 | Corrigir instrumentação Redis (ioredis) e ordem de init do OTel | Spans/métricas de Redis visíveis |
| B20 | Dashboards: API, Banco, Jobs, Negócio | 4 visões no Grafana/Prometheus com dados reais |
| B21 | Correlação request → transação → webhook → outbox → job | 100% dos logs de um request correlacionáveis |
| B22 | Métricas sem label de alta cardinalidade (sem id de usuário/salão) | Cardinalidade estável sob carga |
| B23 | Realtime: retomada de pub/sub, fechamento de publisher, limite global, backpressure | Após falha de Redis, fanout multi-instância se restaura |
| B24 | Mover render de imagem para worker thread pool limitado (contrato HTTP preservado) | p95 de `/posts/preview` sem disputar CPU da API |
| B25 | Substituir `KEYS` por `SCAN`; corrigir chave `bull:jobs:completed` | 0 bloqueio de Redis por varredura |

---

## 4. Metas de performance (a comprovar com baseline)

| Indicador | Meta | Como medir |
|---|---|---|
| Leituras de agenda/fila | p95 ≤ 400 ms | k6 + logs de rota |
| Escritas locais sem provedor externo | p95 ≤ 700 ms | idem |
| Dashboard/relatórios interativos | p95 ≤ 1,5 s | idem |
| Confirmação durável de webhook | p95 ≤ 500 ms | tempo até persistência |
| Erros inesperados na carga nominal | < 0,5% | separar 4xx esperados |
| Espera pelo pool PostgreSQL | p95 ≤ 50 ms | instrumentação de aquisição |
| Atraso do event loop | p95 ≤ 50 ms | `perf_hooks.monitorEventLoopDelay` |
| Notificação transacional pronta p/ envio | p95 ≤ 30 s | outbox `createdAt` → `publishedAt` |

---

## 5. Sequência de entregas (ajustada ao diagnóstico)

| Fase | Entrega | Critério de saída | Bloqueios atuais |
|---|---|---|---|
| **1** | Inventário, baseline e observabilidade | Gargalos e limites **medidos** | ⚠️ Requer acesso ao ambiente Render/Supabase/Upstash (não disponível nesta sessão) |
| **2** | Idempotência e reconciliação | Falhas simuladas não repetem efeitos críticos | Desbloqueada — **B1, B2** |
| **3** | Tenant, RLS e unidade de trabalho | Isolamento e rollback comprovados com PostgreSQL real | Depende de **B5** (role efetiva) e **B6** |
| **4** | Redis, rate limit e health | Falhas limitadas e menor custo por operação | Desbloqueada — **B3, B4, B8, B10** |
| **5** | Queries, índices e relatórios | Ganho medido sem divergência de resultados | Depende de baseline (Fase 1) |
| **6** | Outbox, filas e scheduler | Recuperação após interrupção e backlog controlado | Desbloqueada — **B9, B11** |
| **7** | Separação física e realtime | API estável durante processamento em background | Depende de inventário do Render |
| **8** | Carga, restauração e documentação | Capacidade e recuperação documentadas | Depende das fases anteriores |

---

## 6. O que falta para concluir a Fase 1

A Fase 1 tem duas metades. Esta sessão entregou a metade **código**; a metade **ambiente** exige credenciais/planos que não estão no repositório:

1. **Inventário do ambiente real** (coleta manual, sem expor credenciais): plano/instância da API no Render, valor efetivo de `PROCESS_ROLE` em produção, existência de serviços worker/scheduler, plano e limites do Supabase, modo de endpoint (direto/session/transaction pooler), limites do Upstash, flags efetivas, política de backup + evidência de restauração.
2. **Baseline de 7 dias**: RPS por grupo de rotas, p50/p95/p99, erros, queries e tempo de banco por request, espera do pool, CPU/memória/event loop, comandos Redis por request e por job, idade do job mais antigo, custo mensal e custo por salão ativo.
3. **Ranking de gargalos por impacto total** (frequência × custo) — só é possível com (2).
4. **Dashboard operacional inicial** — depende de (1) para saber qual coletor existe.

Sem (1)–(3), qualquer otimização é chute. Por isso **B7, B5 e o levantamento do Render são o próximo passo**, não uma refatoração.

---

## 7. Riscos confirmados × hipóteses

**Confirmados no código:** B1–B6, P0-11, P0-12, P1-1, P1-3, P1-4, P1-6, P1-7, P1-8, P1-9, P1-11, P1-12, P1-13, P2-1, P2-5.

**Hipóteses (precisam de medição/execução):**
- Extensão RLS dentro de `$transaction` interativa do domínio reentra em **outra conexão** (o comentário `prismaExtensions.ts:20-22` sugere que sim) → testar rollback multi-repository.
- Role da app ignora RLS (P0-7).
- Policies "estritas" (`= current_setting(...)::uuid` em `20260912000003` e `20260920000000`) lançam erro com GUC `''`.
- Cold start/suspensão do plano gratuito do Render compromete jobs.
- BullMQ com filas vazias consome comandos relevantes no Upstash.

**Não confirmado / refutado:** migration local untracked (não existe).

---

## 8. Comandos usados nesta sessão

```powershell
graphify update .                                    # workspace: 13.256 nós / 29.703 arestas
graphify query "idempotencyService executeIdempotent payments webhook" --budget 1500
graphify query "requestContext setRlsContext prismaExtensions tenant" --budget 1500
graphify path "executeIdempotent()" "CreatePixPaymentUseCase"
graphify path "setRlsContext()" "prismaExtensions"
graphify path "notificationDeliveryService" "notificationWorker"
graphify affected "QueueRepository" --depth 2
```

Subagentes de inventário (somente leitura): topologia/processos · RLS/tenant/migrations · idempotência/webhooks · Redis/filas/outbox/scheduler/realtime · queries/relatórios.

---

## 9. Execução — validação da Fase 1 e integridade do histórico de migrations

### 9.1 Onde o `migrate deploy` do zero quebrava (confirmado)

Banco novo (Postgres limpo) + `npx prisma migrate deploy`:

1. `20260911000005_add_remaining_modules` falhava (42P01): adiciona a FK
   `barbershops_organizationId_fkey` para `organizations`, tabela que só é
   criada em `20260912000001` — ordem cronológica invertida.
2. Contornando isso, `20260912000001` falhava (42701) com
   `barbershops.organizationId` já existente.
3. Contornando as duas, o estado final das migrations ainda divergia de
   `prisma/schema.prisma`:
   - `barbershops.city` **nunca foi criada por nenhuma migration** (existia só
     em bancos criados com `db push`) → `GET /api/barbershops` retornava 500
     (Prisma seleciona o campo inexistente) e o check de drift do CI falhava;
   - índice órfão `salon_clients_barbershopId_whatsapp_key`: o
     `DROP CONSTRAINT` de `20260901000000` era no-op porque o índice foi
     criado como `CREATE UNIQUE INDEX`, não como constraint.

**Correções aplicadas** (ver 9.3 para o efeito colateral):

- `20260911000005_add_remaining_modules/migration.sql` — FK condicional à
  existência de `organizations` (em banco novo a FK final é criada por
  `20260925000000_fix_schema_drift_v2`).
- `20260912000001_add_gift_cards_resources_profit_organizations/migration.sql` —
  coluna, índice e FK idempotentes.
- Nova migration `20260929000001_align_history_with_schema` — cria
  `barbershops.city` (`ADD COLUMN IF NOT EXISTS`) e derruba o índice órfão.
  Em produção as duas operações são no-op.

### 9.2 Verificações (2026-09-29)

| Verificação | Resultado |
|---|---|
| `prisma migrate deploy` em banco novo (74 migrations) | `EXIT=0` |
| `migrate diff --from-url <novo> --to-schema-datamodel --exit-code` | `No difference detected` (0) |
| `prisma migrate status` contra produção | 74 migrations, **sem falhas**; pendente só `20260929000000_add_phase5_query_indexes` (ainda não deployado) |
| `migrate diff` produção × schema | apenas os 4 índices da Fase 5 (prod == schema) |
| `npx tsc --noEmit` | 0 erros |
| `npm run test:unit` | 110 arquivos / 911 testes OK |
| `npm run test:integration` (Postgres 5442 + Redis 6379) | 3 arquivos / 20 testes OK |
| `npx vitest run` completo (espelho do CI) | 113 arquivos / 931 testes OK |
| `npm run docs:check` | OK |
| `graphify update .` | 5.802 nós / 13.586 arestas |

### 9.3 Efeito colateral das migrations editadas

Dois arquivos já aplicados em produção mudaram de checksum. **Em 2026-10-03
essa hipótese foi refutada**: o Prisma 6.4.0 não valida checksum e nunca
imprime o suposto `WARNING ... modified since they were applied` (ver 10.4).
As migrations pendentes seguem sendo aplicadas normalmente e nenhum warning
aparece. Não há nada a operar aqui.

### 9.4 Correção de teste pré-existente

`src/tests/integration/routes.smoke.spec.ts` esperava `statusCode: 401` no corpo
da resposta de login. O handler (`app.ts`, ramo `AppError`) nunca envia
`statusCode` — o contrato é `{ success, code?, message, errors, correlationId }`
e o frontend deriva o status da resposta HTTP (`apiClient.ts`). O teste foi
ajustado para o contrato real.

---

## 10. Incidentes de produção e resolução de drift (2026-10-02 → 2026-10-03)

### 10.1 Incidente #1 — `directUrl` exige neutralização dupla

`prisma/schema.prisma:6-9` declara **duas** variáveis para o mesmo datasource:

```prisma
url        = env("DATABASE_URL")
directUrl  = env("DIRECT_URL")
```

Sobrescrever apenas `DATABASE_URL` não muda o alvo: o Prisma continua lendo
`DIRECT_URL` do `.env` e conecta no banco errado. Toda operação manual com
Prisma (deploy, status, diff) precisa setar **as duas**. Detalhe extra: no
`.env` os valores vêm entre aspas — copiá-los crus produz
`P1013: The scheme is not recognized in database URL`.

### 10.2 Incidente #2 — drift em produção

Sintomas encontrados no Supabase (antes da correção):

| Achado | Evidência |
|---|---|
| Tabela `product_reservations` existia só no banco | 0 linhas, 0 FKs, 0 policies/views/triggers, 0 referências em código, 0 ocorrências no git |
| Enum órfão `ProductReservationStatus` | 103 enums no banco, nenhum no `schema.prisma` |
| `appointment_product_reservations.id` com `DEFAULT gen_random_uuid()` | o Prisma 6.4 gera `UUID NOT NULL` **sem** default para `@default(uuid())` — divergência contra o schema |
| `_prisma_migrations` com `20261001120000_add_product_reservations` | migration **sem pasta no repositório** (nunca commitada) |

Causa raiz: outra sessão aplicou ao banco uma migration que nunca foi
commitada e, em seguida, trocou de design para
`20261001000000_add_appointment_product_reservations` — deixando o DDL antigo
órfão em produção.

> **Correção posterior (ver 10.8.B):** essa conclusão estava incompleta. A
> verificação usou `git log` sobre `HEAD` num momento em que `main` ainda não
> tinha recebido o commit `632bec2`, que traz a migration **e** o módulo
> completo da feature. A tabela não era resíduo de design abandonado.

### 10.3 Correção aplicada

1. **Backup restaurável** do DDL removido →
   `docs/backup-product_reservations-20261001.sql`.
2. **Nova migration** `prisma/migrations/20261002000000_resolve_product_reservation_drift/migration.sql`
   (mesmo padrão de `fix_schema_drift` já usado no repo):
   `DROP TABLE IF EXISTS "product_reservations"` →
   `DROP TYPE IF EXISTS "ProductReservationStatus"` →
   `ALTER TABLE "appointment_product_reservations" ALTER COLUMN "id" DROP DEFAULT`.
3. Aplicada nos três bancos acessíveis (10.6).
4. O registro `20261001120000` foi **mantido** no `_prisma_migrations` de
   produção: é a evidência do incidente e, enquanto existir, nenhum
   `migrate deploy` futuro recria a tabela por engano.

Verificações em produção após a correção:

| Verificação | Resultado |
|---|---|
| `prisma migrate status` | 77/77, `Database schema is up to date!`, exit 0 |
| `migrate diff --from-schema-datasource → --to-schema-datamodel` | `No difference detected`, exit 0 |
| `to_regclass('product_reservations')` / `to_regtype('ProductReservationStatus')` | `null` / `null` |
| `column_default` de `appointment_product_reservations.id` | `NULL` |
| `nunca_terminadas` em `_prisma_migrations` | 0 (nada a `migrate resolve`) |
| Dados | 9 users · 8 barbershops · 8 appointments · 1236 error_logs · 200 access_logs · 0 reservations |
| Estrutura | 145 tabelas · 59 policies · 59 tabelas com RLS · 103 enums |

### 10.4 Checksums do `_prisma_migrations` — hipótese refutada

Das 77 migrations: **53** com checksum idêntico ao arquivo, **20** iguais após
normalizar CRLF→LF e **4** divergentes de conteúdo:

| Migration | Situação no git |
|---|---|
| `20260826150000_add_rls_policies` | limpa |
| `20260903010000_products_inventory_retail` | limpa (arquivo em CRLF) |
| `20260911000005_add_remaining_modules` | editada (`M`) |
| `20260912000001_add_gift_cards_resources_profit_organizations` | editada (`M`) |

**Prova de que o Prisma 6.4.0 não valida checksum:** com um checksum
deliberadamente corrompido no banco, tanto `migrate status` quanto
`migrate deploy` retornaram `exit 0`, sem qualquer aviso; as strings
`modified since` / `checksum validation` não existem em
`node_modules/prisma/build/index.js` nem em `schema-engine-windows.exe`.
Algoritmo = sha256 dos bytes brutos do arquivo.

Decisões: **não** alterar checksums em produção (mascararia a auditoria) e
**não** renormalizar os 27 arquivos CRLF agora (custo > benefício, hoje
inerte). Pendência opcional: `.gitattributes` com
`prisma/migrations/** text eol=lf`.

As 4 linhas com `rolled_back_at` em produção são tentativas falhas já
resolvidas pelo próprio Prisma — não requerem `migrate resolve`.

### 10.5 B5 concluído — `BYPASSRLS` confirmado (fecha P0-7)

```text
current_user=postgres   rolsuper=false   rolbypassrls=true   rolcreaterole=true
```

A role de conexão ignora RLS, portanto as **59 policies são inertes**: o
isolamento de tenant depende 100% dos `where barbershopId` do Prisma (e o
`set_config('app.current_barbershop_id', ..., TRUE)` da extensão RLS também é
ignorado por essa role). Qualquer refactor de RLS precisa tratar isso como
premissa. Inventário completo em `docs/RLS-INVENTARIO.md` (B6).

### 10.6 Estado de sincronismo dos bancos

| Banco | Uso | Migrations | Diff vs `schema.prisma` |
|---|---|---|---|
| Supabase (`aws-0-us-west-2.pooler`) | produção | **86/86** — `migrate status`: *Database schema is up to date!* | **vazio** (`This is an empty migration`) — **zero drift** |
| `agendai_db` @ localhost:5442 | testes de integração (`.env.test`) | **86/86** | **vazio** — zero drift |
| `agendai_verify` @ localhost:5442 | banco descartável de verificação | 84/84 (2 atrás: `20261003000002`, `20261003000003`) | 422 bytes — só os 2 `DROP DEFAULT` que o 10.8.C remove de produção |
| `agendai_scratch` @ localhost:5442 | replay para provar `financial_ledger` | 83/83 (3 atrás) | — |
| `agendai_test_db` | parado (container `Exited`, sem porta) | — | — |
| Render `agendai_tcyy` | desconhecido | **inacessível** | não verificado |

A segunda falha de teste da rodada anterior veio da tabela: `/health` compara as
pastas de `prisma/migrations` com `_prisma_migrations`
(`src/shared/infra/http/health.ts:244-258`) e `agendai_db` não tinha recebido
`20261002000000` → `status: pending` → `body.status: degraded`. Aplicada a
migration, os 20 testes de integração voltaram a passar.

### 10.7 Itens abertos

- **Render (`agendai_tcyy`)** — o **frontend** segue no ar
  (`https://agendai-pcts.onrender.com` responde 200 e é origem em
  `cors.json`), mas o **Postgres** é inalcançável: TCP 5432 abre e o servidor
  exige TLS, depois derruba a conexão (`P1017` / `Connection terminated
  unexpectedly`), mesmo com `sslmode=require`. Não é possível rodar
  `migrate status` nem `deploy` lá.
  - `RENDER_DATABASE_URL` **não é lida por nenhum código** — só aparece no
    `SUPABASE_MIGRATION.md` para dumps manuais.
  - O mesmo runbook manda manter o banco Render intacto por **7–14 dias após o
    cutover**; essa janela já encerrou.
  - **Decisão necessária: descontinuar o Postgres do Render (recomendado) e
    remover `RENDER_DATABASE_URL` do `.env` — ou restabelecer acesso, se o
    plano for manter rollback possível.**
- **Tráfego aparente:** última linha em `access_logs` = 2026-10-01T14:54Z e em
  `error_logs` = 2026-10-01T18:48Z (sem registros nos ~46 h seguintes).
  Confirmar se é apenas volume baixo ou se o logging parou.
- **B20** (dashboards Grafana/Prometheus) e baseline de 7 dias — sem ambiente
  de observabilidade disponível.
- `.gitattributes` para `prisma/migrations/**` (opcional, ver 10.4).
- **Conflito de trabalho concorrente:** outra sessão segue commitando em `main`
  (HEAD = `3371530`). `20261002000004_add_post_social_interactions` **foi
  aplicada em produção durante a reteste** — resolvido, ver 10.9.
  - ~~Os testes unitários não estavam 100% verdes por causa dessa sessão~~ —
    **resolvido em 10.10.A**: `postLayoutSafety.spec.ts` (untracked, 0 commits)
    falhava em 4 templates porque o renderizador `postImageService.ts` foi
    reescrito às 13:53 de 03/10 e quebrou o spec de 02/10 (preço em `y=886` >
    limite `ctaY-24=876`). Corrigido no layout, agora 26/26.
- **`financial_ledger`:** as 9 colunas agora estão declaradas no
  `schema.prisma`, mas nada no código as utiliza ainda — é DDL esperando
  implementação.

### 10.8 Rodada de fechamento (2026-10-03) — órfã reconstruída, conflito resolvido, contrato fechado

**A. `20261002000000_financial_ledger` — a única órfã de verdade.**

Aplicada em produção em 2026-10-02T23:52:49Z (checksum `d0b90d79…`, logs
vazios), mas **nunca existiu em nenhum ref do git** (`git log --all` vazio) e
`operationalCosts` / `relatedSourceId` não aparecem nem no código nem no
histórico. Diferente de `20261001120000`, esta é órfã real.

DDL reconstruído por diff (`migrate diff --from-url <local> --to-url <prod>`)
em `prisma/migrations/20261002000000_financial_ledger/migration.sql`:
5 `ALTER TABLE` (`appointments`, `cash_movements`, `commission_entries`,
`fiado_payments`, `profit_entries`) + 4 índices + 1 FK. O checksum original não
é recuperável — irrelevante, ver 10.4.

*Prova do replay:* banco descartável `agendai_scratch` recriado do zero com as
83 migrations locais → diff contra produção caiu de 2337 para **1316 bytes**,
conteúdo = apenas `DropForeignKey ×6` + `DropTable ×2`, a pegada exata de
`20261002000004`. Nenhuma diferença de `financial_ledger`.

**B. O drop de `product_reservations` (10.3) estava errado.**

O commit `632bec2 feat(products): public product reservations with panel pickup
flow` (2026-10-01, hoje ancestral de `HEAD`) traz **junto** a migration
`20261001120000`, o `model ProductReservation` no `schema.prisma` e o módulo
completo (controller, repository, routes, schemas, use-cases, 395 linhas de
teste). A tabela era feature ativa — a checagem de 10.2 consultou apenas
`HEAD` num instante em que `main` ainda não tinha recebido esse trabalho, e o
histórico foi reescrito depois. Produção ficou sem a tabela enquanto o código e
o schema a declaravam.

Resolução, sempre para frente (nunca se edita migration já aplicada):

1. `prisma/migrations/20261003000001_restore_product_reservations/migration.sql`
   reaplica fielmente o DDL de `20261001120000`.
2. Aplicada **só** em produção: `20261002000004` foi retirada do diretório
   durante o `migrate deploy` e devolvida em seguida — para não promover WIP
   não commitado de outra sessão.
3. Replay final = create → drop → create = estado final idêntico ao schema.

**C. Contrato Prisma fechado nas duas direções.**

`schema.prisma` passou a declarar as 9 colunas do `financial_ledger` (+4
índices, +1 FK, `queueItemId` nullable) em `Appointment`, `CashMovement`,
`CommissionEntry`, `FiadoPayment` e `ProfitEntry`.

| Momento | `migrate diff` produção × `schema.prisma` |
|---|---|
| início da rodada | 10462 bytes · 1 `DropForeignKey` · 4 `DropIndex` · 7 `AlterTable` |
| após declarar o `financial_ledger` | 8294 bytes · **0 `Drop*`** |
| após restaurar `product_reservations` | 5292 bytes — só `20261002000004` e 2 `DROP DEFAULT` |
| após aplicar `20261002000004` em produção | 250 bytes — só os 2 `DROP DEFAULT` |
| **após `20261003000002_align_prisma_defaults`** | **70 bytes = `This is an empty migration`** |

**Os 2 `DROP DEFAULT` foram eliminados** (eram 3 colunas: `referral_credit_ledger.id`,
`review_invitations.id`/`updatedAt`), vindos das migrations `20261002000003` e
`20261002000001`: criam `DEFAULT gen_random_uuid()`/`now()` que o Prisma 6.4 não
emite no datamodel. Fechado por `20261003000002_align_prisma_defaults` — a
primeira migração a zerar o diff do módulo inteiro.

Por que é seguro (evidência empírica, não suposição):

- **68 das 68** colunas `updatedAt` de produção agora não têm default — antes
  eram 67 de 68, e `appointments`, `barbershops`, `users` já funcionavam assim
  todo dia → o Prisma fornece `@updatedAt` no INSERT.
- Nenhum SQL raw toca as duas tabelas: acesso é só via
  `prisma.referralCreditLedger.create()` e `prisma.reviewInvitation.*`, que
  geram o UUID no cliente.
- As duas tabelas tinham **0 linhas** no momento da aplicação.

**D. Efeito colateral no código — 3 erros de `tsc`, todos legítimos.**

Tornar `commission_entries.queueItemId` nullable é correto: o banco já era
assim desde o `financial_ledger`. Isso expôs uma falha de runtime latente em
`CommissionRepository.summary` — `entry.queueItem.finalPrice` estouraria
`TypeError` para qualquer linha com `queueItemId` nulo. Corrigido com guarda de
nulidade; `ICommissionEntryDTO.queueItemId` passou a `string | null`.

**E. Nova armadilha: `migrate diff --from-schema-datasource` usa `directUrl`.**

Com o `DIRECT_URL` do `.env` (Supabase) presente, `--from-schema-datasource`
conecta em produção **mesmo com `DATABASE_URL` apontando para o banco local** —
o diff devolvia o resultado de produção. Só quando **as duas** variáveis são
setadas é que `migrate status`/`migrate diff` enxergam o banco alvo. A regra da
10.1 vale para toda operação Prisma, inclusive diff.

**F. Acidente operacional desta rodada.**

Um script de recriação de scratch usou o `DATABASE_URL` do `.env` achando que
era local — ele aponta para o Supabase — e criou um banco `agendai_scratch`
**na produção**. Removido em seguida (`DROP DATABASE`; sobrou apenas
`postgres`). Nenhum dado de produção foi alterado.

**G. Banco de integração recriado.**

O Docker Desktop caiu duas vezes na rodada; após o segundo restart `agendai_db`
voltou com 143 tabelas, **sem** `_prisma_migrations` e 7 tabelas atrás
(`referral_credit_ledger`, `review_invitations`, `product_reservations`,
`post_comments`, entre outras). Como `migrate dev`/`deploy` devolvem `P3005` em
banco não vazio, o banco de testes foi **recriado do zero** (é o apontado por
`.env.test` e pelo script `test:integration`): 84/84 migrations +
`npm run prisma:seed`.

### 10.9 Rodada de reteste (2026-10-03, tarde) — contrato código↔banco fechado

Reanálise do que já estava implementado achou **um único bug real de código**,
fora os `DROP DEFAULT` que 10.8 deixou em aberto.

**A. O único mismatch código↔banco real: `idempotencyKey` de `cash_movements`.**

Varredura dos validadores Zod de `idempotencyKey`, cada um mapeado à coluna que
realmente escreve:

| Validador | Coluna | Tamanho real da coluna | Validador | Status |
|---|---|---|---|---|
| `cash/cashMovementSchema.ts:52` | `cash_movements` | **160** | `.max(100)` | ❌ **divergente** |
| `deposits/depositPolicySchema.ts:17` | `appointment_deposits` | 100 | `.max(100)` | ✅ |
| `loyalty/loyaltyProgramSchema.ts` (5×) | `loyalty_ledger_entries` | 100 | `.max(100)` | ✅ |
| `recurringPackages/recurringPackageSchema.ts:44` | `recurring_package_usages` | 100 | `.max(100)` | ✅ |
| `payments/.../RefundPaymentController.ts:21` | `refunds` | 100 | `length > 100` | ✅ |
| `notifications.routes.ts:77` + `notificationDeliveryService.ts:129` | `notification_deliveries` | 180 | `> 180` | ✅ |
| `products/productSchemas.ts:14` | `retail_sales` | 120 | `.max(120)` | ✅ |
| `productReservations/productReservationSchemas.ts` | `customerName` / `whatsapp` | 160 / 20 | `.max(160)` / 11 dígitos | ✅ |

Efeito real do bug: o dedup de idempotência é `where: { idempotencyKey }` por
igualdade exata, então uma chave de 101–160 caracteres era **recusada pelo
validador antes de chegar ao banco** — que a aceitaria.

Corrigido em `src/modules/cash/cashMovementSchema.ts:52`: `.max(100)` → `.max(160)`.
A direção foi alinhar o **código ao banco**, não o contrário, por quatro
motivos: (a) não exige nova migração DDL em produção; (b) o `financial_ledger`
definiu `VARCHAR(160)` deliberadamente; (c) `cash_movements` é o **único**
outlier — todos os outros pares já coincidem, então 160 é o padrão real da
tabela, não um erro do banco; (d) nenhum teste fixava o limite de 100 e a
tabela tem 0 linhas.

**B. `20261002000004_add_post_social_interactions` aplicada em produção.**

Chegou a estar pendente (ver 10.7); ao reexecutar o `migrate status` nesta
rodada já constava como aplicada pela outra sessão. Produção e `agendai_db`
passaram a 85/85 — o item de 10.7 se resolveu sozinho.

**C. Deploys desta rodada — sempre com `DATABASE_URL` **e** `DIRECT_URL` (10.8.E).**

1. **Local** (`agendai_db`): `DATABASE_URL` e `DIRECT_URL` neutralizadas para
   `postgresql://agendai:agendai123@localhost:5442/agendai_db`, alvo confirmado
   no `status` antes do deploy (`localhost:5442`), 84 → **85/85**.
2. **Produção**: alvo natural do `.env` (Supabase) confirmado no `status`, 84 →
   **85/85**, *Database schema is up to date!*. Como `000004` já estava
   aplicada, desta vez não foi preciso segurar nenhuma pasta WIP.

**D. Resultado — diff zerado pela primeira vez na sessão.**

`prisma migrate diff --from-schema-datasource … --to-schema-datamodel`
contra produção devolve **70 bytes = `-- This is an empty migration`**.
As 3 defaults removidas: `review_invitations.updatedAt` passou de 67/68 para
**68/68** colunas `updatedAt` sem default, 0 linhas afetadas.

*(Estado desta etapa: 85/85. O commit `e9700d3` da outra sessão reabriu um
drift logo depois — ver 10.10.C, que leva a 86/86 e mantém o diff vazio.)*

### 10.10 Rodada "resolva tudo" (2026-10-03, noite) — três achados restantes

**A. Layout do `oferta-clean` estourava a faixa do CTA (4 templates).**

`postLayoutSafety.spec.ts` falhava em `oferta-clean`, `combo-premium`,
`gift-card` e `avaliacao-clientes` — as 4 são apelidos do mesmo
`TEMPLATE_LAYOUTS["oferta-clean"]` (`postImageService.ts:777-782`), então era
**um** bug em **um** ponto. Causa: o orçamento fixo `-420` do `photoH` não
acompanha a altura do título, que varia com o número de linhas; com título de
2 linhas `photoH` ficava em 272 e o preço caía em `title.bottom + 210 = 886`
contra o limite `ctaY - 24 = 876`.

Corrigido com o `Math.min` que já é o idiom do arquivo (linhas 756 e 290),
prendendo o preço em `ctaY - 24` e o nome em `priceY - 95` para nunca
sobrepor. `postLayoutSafety` passou de 4 falhas para **26/26**. Só editei
depois de confirmar que a outra sessão parou às 16:08 (6 h sem tocar no
arquivo).

**B. `cashMovementRepository.spec.ts` obsoleto em HEAD (4 testes).**

A outra sessão reescreveu o repositório às 16:10 — **um minuto depois** de
gravar o spec às 16:08 — trocando `createdAt` → `occurredAt` e `$queryRaw`
(agregação SQL com `GROUP BY`) por `findMany` + agregação em JS, e não
atualizou o spec. Reescrito para a implementação atual, com `vi.hoisted`
(forma correta no vitest 4) e asserções de recorte diário **independentes de
fuso** (`ms` 0/999 + duração de `86_399_999` ms + `shopDateKey`), no lugar das
`getHours()` antigas que só passavam em host -03:00.

Restaurado junto o **desempate por id** que a refatoração derrubou —
`orderBy: { occurredAt: "desc" }` sem tie-break dá ordem instável entre
requisições quando dois lançamentos compartilham `occurredAt`. Voltou a
`[{ occurredAt: "desc" }, { id: "desc" }]`, como o próprio nome do teste
("desempata por id") já documentava.

**C. `appointments.finalPrice`: DDL para trás do schema → `20261003000003`.**

Drift **novo**, introduzido entre o meu diff vazio das 14h e a noite: o commit
`e9700d3` declarou `Float? @db.Real` em `Appointment.finalPrice`, mas a coluna
em produção é `DOUBLE PRECISION` — o DDL de `20261002000000_financial_ledger`
usou o tipo padrão do `Float`. Comparação:

| Coluna | Schema | Banco | |
|---|---|---|---|
| `queue.finalPrice` | `@db.Real` | `real` | ✅ |
| `appointments.finalPrice` | `@db.Real` | `double precision` | ❌ |

`DOUBLE PRECISION` era o deslize, não a intenção: o `20260726000000_init` já
criava a coluna irmã como `REAL`, e `percentage`/`amount`/`marginPercent` usam
`@db.Real` na mesma convenção. Resolvido **pelo lado do banco**
(`ALTER TABLE "appointments" ALTER COLUMN "finalPrice" SET DATA TYPE REAL`),
que honra o contrato do schema sem reescrever migration já aplicada.

**Sem perda, comprovado antes de rodar:** produção com 8 agendamentos e
`finalPrice` preenchido em **0** (`completedAt` também 0 — a coluna só é
gravada na conclusão) e `agendai_db` com 0 linhas: conversão de null por null.

### 10.11 Validação final (2026-10-03, noite)

| Comando | Resultado |
|---|---|
| `npx prisma validate` | válido |
| `npx tsc --noEmit` | 0 erros |
| `npx prisma migrate status` (produção) | **86/86 — up to date** |
| `npx prisma migrate status` (`agendai_db`) | **86/86 — up to date** |
| `npx prisma migrate diff` (produção × schema) | **vazio** — zero drift |
| `npm run test:unit` | 141 arquivos / **1277 testes — todos OK** |
| `npm run test:integration` | 3 arquivos / **20 testes** OK |
| `npm run test:security` | 2 arquivos / **7 testes** OK |
| `npm run docs:check` | OK |
| `graphify update .` | 6397 nós / 15025 arestas / 339 comunidades |

**Suíte 100% verde pela primeira vez** — nenhuma falha, nenhum skip pendente.

Nota histórica (já resolvida): na passada das 14h as 4 falhas do unit eram
`postLayoutSafety.spec.ts` (10.10.A) e o `postRenderPool.spec.ts` já tinha
falhado por timing numa primeira execução — isolado passa 6/6, é flake de
carga e o módulo não referencia Prisma.

**Última revisão:** 2026-10-03.
