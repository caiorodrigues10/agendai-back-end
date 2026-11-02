# AGENTS.md — Agenda Já Backend

> **Ponto de entrada obrigatório** para qualquer IA neste repositório (`agendai-back-end/`).
> Autossuficiente sem a pasta externa do monorepo.
> Codex e OpenCode usam este arquivo como entrada.

**Última revisão documental:** 2026-09-08 (baseada no código atual).
**Prisma:** 6.4.0 — não tratar como 7.x.

---

## 0. Regras essenciais

1. Fluxo: **Route → middleware → Controller → UseCase → IRepository/Provider → infra**.
2. Erros de negócio: `AppError`. Resposta `{ success, data|message }`.
3. Validação de entrada: **Zod** nas rotas/schemas.
4. DI: registrar no `shared/container`. Não espalhar `new PrismaClient()`.
5. Operações de assinatura/estoque/fiado/comissão: preservar **atomicidade** (transações).
6. **Não existe `npm run lint`** neste package — não inventar.
7. DB produção: **`prisma migrate deploy`**, não `db push`.
8. Segredos só via env (nomes em `.env.example`); nunca commitar credenciais.
9. Graphify: [docs/agents/GRAPHIFY.md](docs/agents/GRAPHIFY.md).
10. Escopo mínimo; sem commit/PR automático sem pedido.

---

## 1. O que é esta API

API REST SaaS multi-tenant (Fastify 4 + TypeScript + Prisma 6 + PostgreSQL) para salões/barbearias: fila, agenda, CRM, pacotes, produtos/estoque, financeiro, comissões, assinaturas (Asaas / AbacatePay / Mercado Pago), WhatsApp (Evolution), e-mail (Resend), GCS, admin.

Prefixo: `/api` (exceto health conforme `app.ts`).

---

## 2. Inventários locais

| Doc | Conteúdo |
|---|---|
| [STRUCTURE.md](docs/agents/STRUCTURE.md) | Pastas, módulos, rotas, middlewares, integrações |
| [DOMAIN_MAP.md](docs/agents/DOMAIN_MAP.md) | Domínio → rotas → persistência |
| [PACKAGES.md](docs/agents/PACKAGES.md) | Dependências diretas |
| [SCRIPTS.md](docs/agents/SCRIPTS.md) | Scripts npm (inclui o que altera banco) |
| [BUSINESS_RULES.md](docs/agents/BUSINESS_RULES.md) | Invariantes |
| [ARCHITECTURE.md](docs/agents/ARCHITECTURE.md) | Clean Architecture + SOLID |
| [GRAPHIFY.md](docs/agents/GRAPHIFY.md) | Graphify e subagentes |

Detalhes históricos úteis: `AI_GUIDE.md`, `system-docs/MANUAL.md`, `system-docs/api.http`, `docs/RUNBOOK_MIGRATIONS.md` — **em conflito, prevalece este AGENTS.md + inventários**.

---

## 3. Comandos frequentes

Diretório: **`agendai-back-end/`**.

```bash
npm install
npx prisma generate
npm run dev
npm run typecheck
npm run test:unit
npm run docs:check
```

**Testes durante o desenvolvimento (não pesar a máquina):**

```bash
npm run test:changed   # só arquivos alterados vs. HEAD (vitest --changed)
npm run test:related   # testes relacionados aos arquivos informados (vitest related)
```

Suíte completa (`npm test` = unit, sem integração) **só no CI**. Integração/containers
(`test:integration*`) e pentest rodam por script dedicado, com `maxWorkers=1` e sem
paralelismo de arquivos — Testcontainers só sob `USE_TESTCONTAINERS=1` explícito.
`vitest.config.mts`: `pool: 'forks'` (max 2), `fileParallelism: false`,
`reporters: ['dot']`, `clearMocks`/`restoreMocks`, coverage desligado por padrão;
scripts de teste usam `NODE_OPTIONS=--max-old-space-size=2048`.

Scripts que **alteram banco:** `prisma:migrate*`, `db:push`, `prisma:seed`, `prisma:seed:demo`, `prisma:seed:tenant`, `start:prod`, `security:audit-logs`. Ver [SCRIPTS.md](docs/agents/SCRIPTS.md).

`test:coverage` **não** configura provider de coverage no `vitest.config.mts` — não afirmar geração de relatório de cobertura.

---

## ⚠️ Risco conhecido: Drift do banco de dev

O banco de dev era criado via `db push` (sem `_prisma_migrations`), deixando o histórico em `prisma/migrations/` dessincronizado do banco real: `migrate deploy` caía em P3005, `/health` reportava `migrations: error` e colunas novas só existiam no schema.

**Status (2026-10-16): drift resolvido nos bancos locais `agendai` (dev) e `agendai_db` (testes).** Os dois receberam o schema completo (`prisma db push` / diff SQL) e um **baseline** das 99 migrations com `prisma migrate resolve --applied` (não executa SQL; seguro porque `prisma migrate diff --from-migrations --to-schema-datamodel --shadow-database-url <shadow>` ficou **vazio** = histórico == schema). Resultado: `npm run db:validate-schema` → "Database schema is up to date!", `migrate deploy` → "No pending migrations" e `/health` → `migrations: ok, pending: 0` (o 500/P2022 de `POST /api/auth/register` e os testes `routes.smoke`/`monitoring.smoke` dependiam desse estado).

**Produção/staging NÃO foram tocados** — antes do primeiro `migrate deploy` lá, compare histórico × banco (`prisma migrate diff --from-url ... --to-schema-datamodel`) e baselinar se necessário. O `docker-compose.dev.yml` mantém `RUN_MIGRATIONS: "false"`; um dump restaurado sem `_prisma_migrations` ainda cairia em P3005 (baseline de novo), enquanto um banco vazio do zero aceita `migrate deploy` normalmente.

**Drift corrigido em 2026-09-19 via `db push --accept-data-loss`:** A constraint unique `queue_appointmentId_key` na tabela `queue` estava declarada no schema (`@unique` em `appointmentId`) mas não existia no banco. O `db push` a aplicou. Dados verificados: zero valores duplicados não-nulos em `appointmentId`, portanto a aplicação é segura. Além disso, o `equipment_movements.equipmentId` foi alterado de `ON DELETE CASCADE` para `ON DELETE SET NULL` (campo tornado nullable) — migration manual criada em `prisma/migrations/20260919000000_equipment_movement_set_null/`.

**Drift corrigido em 2026-10-03 via `db push --accept-data-loss`:** O banco de dev acumulou atraso em relação ao `schema.prisma` (colunas/tabelas novas ausentes), causando 500 (P2022) em `/barbershop/insights`, `/commissions/summary`, `/barbershops/:id`, `/:id/profit/period/:p` e `/organizations` — e tela branca de Clientes no front. **Causa raiz:** o `db push` do startup falhava por aviso de perda de dados (tabelas legadas `client_memberships`, `membership_*`, `salon_membership_plans` com 0 linhas, fora do schema) e o `docker-compose.dev.yml` silencia a falha com `|| echo '[warn] ...'`. Correção aplicada: `DROP POLICY IF EXISTS tenant_isolation` nas 5 tabelas legadas, depois `db push --accept-data-loss` (tabelas legadas removidas, colunas/índices/tabelas novas criados) + `prisma generate` + restart do container. Backups SQL do pré-sincronismo foram gerados fora do repositório. A partir de agora, **alguém precisa olhar o stdout do startup do container** — um `db push` falho ainda é silenciado.

## ⚠️ Risco conhecido: migrations com timestamp futuro (ordem de aplicação)

**Números reais (verificados em 2026-11-01):**

| medida | valor | como medir |
|---|---|---|
| migrations na pasta `prisma/migrations/` | **125** | `ls prisma/migrations \| grep -v migration_lock \| wc -l` |
| migrations com prefixo **> 20261101** (a série datada 2026-11-05…2026-11-10) | **11** | `ls prisma/migrations \| grep -v migration_lock \| awk -F_ '$1 > "20261101"' \| wc -l` |
| migrations com prefixo **posterior ao dia em que a pasta foi criada** → **escopo real do rename** | **37** | comparar o prefixo com a data do commit que adicionou a pasta (`git log --diff-filter=A`) |
| linhas em `_prisma_migrations` do banco `agendai` (dev) | **126** | `select count(*) from _prisma_migrations` |
| linhas em `_prisma_migrations` do banco `agendai_db` (testes) | **125** | idem |

As **11 migrations da série 2026-11-05…2026-11-10** — de `20261105120000_data_import_phase2_targets` até `20261110130000_import_file_formats` — têm prefixo de data **posterior ao dia em que foram criadas** (2026-11-01) e **já estão aplicadas** em `agendai` e `agendai_db`. São as 11 que importam para a regra abaixo: enquanto existirem, nenhuma migration nova pode usar a data real de hoje.

O escopo de renomeação, porém, é maior: **37 migrations** (as 11 da série + 26 mais antigas com o mesmo defeito) têm prefixo posterior ao dia em que foram criadas. Ver item de dívida técnica abaixo.

O banco `agendai` (dev) tem **1 linha a mais** que a pasta (126 vs 125): `20261027000000_post_media_gallery_default`, aplicada sem pasta correspondente. É a linha excedente conhecida e **não** afeta o `migrate status` ("up to date") nem o `migrate diff` (vazio).

O Prisma ordena migrations pelo **nome da pasta** (timestamp). Uma migration nova com prefixo **≤ o maior prefixo já aplicado** seria aplicada **fora de ordem** em relação às que já estão no banco: o `migrate deploy` aplica a pendente antes das anteriores e sinaliza "migration applied out of order"; no `migrate dev` isso é erro P3009.

**Regra (revista em 2026-11-01, sem contradição):**

1. **O prefixo de toda migration nova é estritamente maior que o maior prefixo que já existe na pasta `prisma/migrations/`.** Hoje esse teto é **`20261110130000`** — é ele que garante a ordem de aplicação. Este é o único critério mandatório.
2. O prefixo **não pode ser uma data real** enquanto a série datada em `2026-11-05`…`2026-11-10` não for renomeada: a data real de hoje (2026-11-01) é **menor** que os prefixos já aplicados, e uma migration com essa data entraria fora de ordem. Portanto, enquanto a série existir, o prefixo novo continua na série (2026-11-10+). A regra "prefixo ≤ data real do dia" **vale de novo** quando a série for renomeada.
3. O prefixo precisa ser **único** e a ordenação precisa ser estável: use `AAAAMMDDHHMMSS` com a hora em UTC, sempre acima do teto do passo 1 (ex.: `20261110130000`).
4. Renomear as migrations inconsistentes (escopo real: **37**, ver dívida técnica abaixo) ou resolvê-las no banco é **tarefa separada, ainda não autorizada** — até lá, vale o passo 1.

Estado verificado em 2026-11-01 (após `20261110130000_import_file_formats`): `prisma migrate status` → "Database schema is up to date!" nos dois bancos; `prisma migrate diff --from-url … --to-schema-datamodel` → **vazio** em `agendai` e `agendai_db`. Detalhes: `docs/agents/SCRIPTS.md` §Observações críticas.

### 🔻 Dívida técnica — renomear as migrations com prefixo inconsistente

**Escopo real: 37 migrations** — as 11 da série `20261105`…`20261110` **mais** 26 mais antigas cujo prefixo também é posterior ao dia em que a pasta foi criada (de `20260831000000_seed_default_plans` a `20260912000003_add_client_procedure_records`). Lista completa e recontagem: `docs/RUNBOOK_MIGRATIONS.md`.

**Prazo: 2026-12-31** — ou antes de qualquer deploy em ambiente novo que dependa de `migrate deploy` (renomear depois é mais caro).

**Como fazer (quando for autorizado):**

1. `git mv` das 37 pastas, preservando o nome do arquivo interno (`migration.sql`) e a **ordem relativa** dos prefixos.
2. Banco: `prisma migrate resolve --applied <novo_nome>` para cada pasta renomeada **e** resolver a pasta antiga (`--rolled-back` na antiga, se houver linha com o nome antigo). Nunca editar `_prisma_migrations` com `UPDATE` direto sem backup — a coluna `checksum` é conferida no `migrate deploy`.
3. Separar a linha excedente do `agendai` (`20261027000000_post_media_gallery_default`, aplicada sem pasta): resolver como aplicada criando a pasta correspondente ou marcar como rolled-back após verificar o efeito no schema.
4. Atualizar `docs/RUNBOOK_MIGRATIONS.md` e a tabela de números acima.
5. Rodar nos dois bancos: `prisma migrate status` (esperado "up to date"), `prisma migrate diff --from-url … --to-schema-datamodel` (esperado vazio) e `prisma migrate diff --from-migrations … --shadow-database-url …` (esperado vazio).

**Enquanto a dívida não for paga:** vale a regra do passo 1 (prefixo novo > maior prefixo da pasta). Nada trava — a dívida é de higiene do histórico, não de funcionamento.

## ⚠️ Risco conhecido: `prisma db pull` sobrescreve schema.prisma

**Nunca rodar `prisma db pull` com mudanças manuais não commitadas no schema.**

`prisma db pull` (introspecção) sobrescreve `schema.prisma` inteiro com o estado refletido do banco. Se houver mudanças manuais não commitadas (novos models, campos, relations), elas são perdidas silenciosamente. Além disso, a introspecção:
- Remove todos os `onDelete: SetNull` e `onDelete: Restrict` das relations (pois o banco não armazena essas instruções Prisma).
- Remove todas as anotações `@db.Text` (o banco armazena como `text`, mas a introspecção gera `String` sem annotação).
- Remove comentários inline do schema.
- Reordena campos e relations alfabeticamente.
- Pode alterar cardinalidade de relations (ex: `Subscription[]` → `Subscription?`).

**Se bater em drift de shadow database (P3006), a saída é investigar o drift, não rodar db pull.** Usar `prisma db diff` para diagnosticar, ou restaurar o schema do último commit e reaplicar as mudanças manualmente.

## ⚠️ Risco conhecido: Prisma Client velho no container dev após mudança no schema

Após qualquer mudança em `prisma/schema.prisma`, `docker exec agendai_api_dev npx prisma generate` sozinho **não é suficiente**: o `tsx watch` recarrega o código de `src/`, mas o processo continua com o Prisma Client antigo em memória. É preciso `docker restart agendai_api_dev` (o entrypoint já roda `prisma generate` na subida). Sintoma típico: `Unknown field 'X' for select statement on model 'Y'` logo após adicionar uma relation/field nova. Observado em 2026-09-19 (dois restarts de debug na mesma sessão).

## ⚠️ Cuidado: Queries com comparação entre colunas

Prisma **não suporta** comparar duas colunas da mesma tabela no `where` (ex: `quantityAvailable < minQuantity`). Se você tentar algo como `{ quantityAvailable: { lt: prisma.equipment.fields.minQuantity } }`, vai falhar em runtime — mas se houver um `.catch(() => 0)` ou similar, o erro fica silencioso e o valor retornado será sempre o fallback.

**Regra:** Para comparações coluna-contra-coluna, use `findMany` + filtro em memória (opção A) ou `prisma.$queryRaw` (opção B). Nunca confie apenas em testes unitários com mock para validar essas queries — sempre teste contra o Postgres real (`docker exec agendai_db_dev psql ...`) antes de confiar no resultado.

**Caso real (2026-09-18):** `equipmentRepository.countByBarbershop()` usava `quantityAvailable: { lt: prisma.equipment.fields.minQuantity as any }` dentro de `.catch(() => 0)`. O mockRepo do teste filtrava corretamente em memória, então todos os testes passavam — mas contra o banco real, `lowStockCount` sempre retornava 0.

---

## 5. Checklist de mudança

- [ ] Rota/middleware/Zod/container atualizados?
- [ ] UseCase sem acoplar SDK sem necessidade?
- [ ] Transação onde há invariante financeira/estoque?
- [ ] Teste unitário com mock de repository quando regra muda?
- [ ] `docs:check` se package/scripts/estrutura documentada mudou?

### Sessões e falha do Redis (auth)

`UserSession` + claim `sid`: revogação grava `revokedAt` no banco, apaga os refresh tokens e seta `session:revoked:<sid>` no Redis (TTL = vida do access token). A checagem no `authenticate` espera **150ms** pelo Redis e cai no banco; se o banco confirmar revogação, a flag é **repovada** (repovoamento pós-falha). Estado `unknown` (Redis **e** banco fora): **fechado** para `MASTER_ADMIN`, **aberto** com log para os demais. Limpeza: cron `sessionsCleanup` (expiradas >30d nunca revogadas, revogadas >90d), com lock Redis + `CronRun`.

---

## 6. Bugs conhecidos fora de escopo

> **Status (2026-09-25):** os 3 bugs abaixo foram RESOLVIDOS nesta sessão de trabalho.

- **RESOLVIDO — Vouchers (case mismatch):** `agendai/src/infra/vouchersApi.ts` agora é um adapter que converte tipos FE (`PERCENTAGE`/`FIXED`/`FREE_SERVICE`) ↔ BE (`percent`/`fixed`/`free_service`) nos dois sentidos. Sem 400 em criar/editar.
- **RESOLVIDO — Cash Panel (tipo inválido):** enum `cashMovementSchema.ts` aceita `TIP` e `OTHER` (coluna VarChar(30), sem migração); listas de sinal `positiveTypes` (+ TIP/OTHER como receita) atualizadas em `cashMovementRepository.getSummary`, `cashMovementUseCases.closeDay` e `dailyCloseoutUseCases` (closeDay + getCloseout).
- **RESOLVIDO — clientPortalSchema (schemas faltantes):** `barbershopIdQuerySchema`, `staffDashboardQuerySchema` e `linkIdParamsSchema` existem em `clientPortalSchema.ts` (exports nas linhas ~58/62/66); typecheck passa. Bug do commit 5be40c2, já corrigido no código.

