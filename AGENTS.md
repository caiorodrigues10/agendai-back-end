# AGENTS.md — AgendAI Backend

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

Scripts que **alteram banco:** `prisma:migrate*`, `db:push`, `prisma:seed`, `start:prod`, `security:audit-logs`. Ver [SCRIPTS.md](docs/agents/SCRIPTS.md).

`test:coverage` **não** configura provider de coverage no `vitest.config.mts` — não afirmar geração de relatório de cobertura.

---

## ⚠️ Risco conhecido: Drift do banco de dev

O banco de dev não tem tabela `_prisma_migrations` (aparenta ter sido criado via `db push`, não via `migrate deploy`). O histórico em `prisma/migrations/` está dessincronizado do banco real. Antes de rodar `prisma migrate deploy` em staging/produção pela primeira vez, isso precisa ser investigado e corrigido (provavelmente com `prisma migrate resolve --applied` para as migrations já refletidas no schema, ou um baseline novo).

Por conta desse drift, o `docker-compose.dev.yml` tem `RUN_MIGRATIONS: "false"` — caso contrário o container entra em crash loop (P3005). **Se você está clonando o projeto do zero e o banco de dev está vazio, mude `RUN_MIGRATIONS` para `true` temporariamente na primeira subida, ou rode `prisma db push` manualmente antes.**

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

---

## 6. Bugs conhecidos fora de escopo

- **Vouchers (case mismatch):** `vouchersApi.ts` envia tipos `PERCENTAGE`/`FIXED`/`FREE_SERVICE` (maiúsculo), mas o backend (`voucherSchema.ts`) espera `percent`/`fixed`/`free_service` (minúsculo). Falha com 400 em criar/editar voucher. Necessário mapeamento de case no `vouchersApi.ts` ou alteração dos schemas.
- **Cash Panel (tipo inválido):** `CashPanel.tsx` envia tipos de movimentação `TIP` e `OTHER` que não existem no enum do backend (`cashMovementSchema.ts`). Falha com 400 ao criar movimentação com esses tipos.
- **clientPortalSchema (schemas faltantes):** `clientPortalController.ts` importa `barbershopIdQuerySchema`, `staffDashboardQuerySchema` e `linkIdParamsSchema` de `clientPortalSchema.ts`, mas esses exports não existem no schema. Gera erro TS2305 no typecheck. Bug pré-existente desde o commit 5be40c2.
