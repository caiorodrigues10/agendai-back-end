# Baseline de arquitetura — Fase 0 (diagnóstico)

> Artefato da **Fase 0** do plano de padronização Clean Architecture / inglês.
> Medição única e reprodutível; **nenhum código de produção foi alterado** nesta fase.
> Comando: `npm run architecture:check` (dependency-cruiser 18.7.2, config
> `.dependency-cruiser.cjs`).

## 1. Números medidos (hoje)

`depcruise --config .dependency-cruiser.cjs --output-type json src`

| Regra | Severidade | Violações |
|---|---|---|
| `no-prisma-runtime-in-use-cases` (código de produção em `useCases/` importa `@/libs/prismaClient`) | warn | **77** |
| `no-prisma-runtime-in-controllers` (`controllers/` importa `@/libs/prismaClient`) | warn | **28** |
| `no-circular` (caminhos de ciclo reportados) | warn | **8** |
| **Total** | | **113** |
| Regras da arquitetura alvo (`clean-architecture-*`) | error | **0** (vacías — camadas `domain/`, `application/`, `presentation/` ainda não existem) |

Exit code: **0** (só warnings) → gate verde hoje; zerar é a meta das Fases 1–2.

### Verdade do grafo (ciclos)

| Métrica | Valor |
|---|---|
| SCCs (componentes fortemente conexos com >1 nó) | **3** |
| Arquivos dentro de ciclos | **16** |
| Arestas direcionadas internas a SCCs | **21** |
| Pares bidirecionais diretos `A↔B` | **2** |
| Self-loops | 0 |

Conteúdo dos 3 SCCs:

1. **SCC grande (12 arquivos)** — `appointments/useCases` (2) ↔ `fiado/useCases` ↔
   `queue/useCases` (2) ↔ `reputation/reviewInvitationService` ↔
   `shared/useCases/CompleteServiceUseCase` ↔ `whatsappOwnerBot` (2) ↔
   `shared/infra/queue` (index, ownerBotQueue, ownerBotWorker). Este é o único
   ciclo com risco real de refactor (Fase 2, depois dos módulos members).
2. `libs/prismaClient.ts` ↔ `libs/prismaExtensions.ts` (2).
3. `dataImport/utils/csvParser.ts` ↔ `dataImport/utils/sheetMatrix.ts` (2).

## 2. Divergência com os números do briefing (175 / 78 / 28 / 69)

| Briefing | Medido aqui | Explicação |
|---|---|---|
| 78 use cases importam Prisma | grep de arquivos: **78**; dependency-cruiser: **77** | A diferença é `appointments/useCases/complete/CompleteAppointmentUseCase.ts`, que usa `import type { AppTx }` — **type-only é permitido pela arquitetura-alvo e o dependency-cruiser não conta como violação**. Conferido arquivo a arquivo: os 78 do briefing = 77 runtime + 1 type-only. |
| 28 controllers importam Prisma | **28** ✓ | Idêntico (arquivos com import runtime de `@/libs/prismaClient` em `**/controllers/**`, specs excluídas). |
| 69 pares de ciclo | **8 caminhos / 3 SCCs / 21 arestas** | **Não reproduzível com dependency-cruiser neste grafo** (testado com esta config e com o preset `recommended-warn-only`: nos dois casos `no-circular = 8`). Hipóteses: contagem de outra ferramenta (ex.: madge), outro recorte de arquivos ou estado anterior do grafo. **Pendência:** confirmar a metodologia original antes de usar "69" como alvo — os alvos das fases são: `no-circular → 0`, SCCs → 0 (medidos aqui). |
| 175 total | **113** | 105 (Prisma) + 8 (ciclos) com esta config. Com o preset `recommended-warn-only` adicional sairia 159 (acrescenta 45 `no-orphans` + 1 `not-to-unresolvable`), também ≠ 175. |

## 3. Débito de Prisma por módulo (priorização das Fases 1–2)

Total 105 = 77 use cases + 28 controllers, em **19 módulos**:

| Módulo | Total | useCases | controllers |
|---|---|---|---|
| admin | 38 | 19 | 19 |
| auth | 14 | 14 | 0 |
| barbershops | 11 | 10 | 1 |
| users | 9 | 6 | 3 |
| subscriptions | 9 | 9 | 0 |
| appointments | 4 | 4 | 0 |
| crm | 3 | 2 | 1 |
| posts | 2 | 0 | 2 |
| analytics | 2 | 2 | 0 |
| organizations | 2 | 2 | 0 |
| payments | 2 | 2 | 0 |
| queue | 2 | 2 | 0 |
| feed | 1 | 0 | 1 |
| plans | 1 | 0 | 1 |
| cases | 1 | 1 | 0 |
| contact | 1 | 1 | 0 |
| fiado | 1 | 1 | 0 |
| packages | 1 | 1 | 0 |
| products | 1 | 1 | 0 |

## 4. Regras da config (`.dependency-cruiser.cjs`)

**Dívida conhecida (`severity: warn` — conta, não derruba o gate):**

- `no-prisma-runtime-in-use-cases` — de: `src/modules/*/useCases/**` (specs
  excluídas) → para: `src/libs/prismaClient.ts`.
- `no-prisma-runtime-in-controllers` — de: `src/modules/**/controllers/**`
  (specs excluídas) → para: `src/libs/prismaClient.ts`.
- `no-circular` — qualquer dependência circular.

**Arquitetura alvo (`severity: error` — vazias hoje, ativam sozinhas quando as
camadas forem criadas):**

- `clean-architecture-pure-layers` — `domain/` e `application/` não importam
  Prisma runtime, Fastify, Redis/BullMQ. (`import type` e enums de
  `@prisma/client` continuam permitidos — e invisíveis para o grafo, ver §5.)
- `clean-architecture-presentation-via-di` — `presentation/` não importa
  `prismaClient` diretamente.
- `clean-architecture-no-cross-layer-infra` — `presentation/` e `application/`
  não importam `infra/` (nem do próprio módulo) — só via container/DI.

Regras **deliberadamente não ativadas** nesta fase (candidatas para Fase 2+,
a confirmar): proibição de cross-module (`modules/X → modules/Y`) e `no-orphans`
(45 órfãos hoje — sinal de código possivelmente morto, iniciativa separada).

## 5. Observações de medição (importante para as próximas fases)

1. **`import type` não entra no grafo** (0 arestas `type-only` no JSON do
   dependency-cruiser 18.7.2 com esta config) — logo, type-only de Prisma/Fastify
   **não pode dar violação por construção**. É compatível com a regra
   "`import type` e enums são permitidos em domain/application".
2. **Achado — arquivo fora de lugar:** `users/useCases/uploadAvatar/AvatarController.ts`
   é um **controller dentro de `useCases/`** (contado na regra de use cases).
   Na Fase 1 correspondente, mover para a camada certa (registro: não corrigir
   fora do fluxo de refactor do módulo).
3. **Achado — resolver:** `not-to-unresolvable` acusa `dataImport/utils/pdfParser.ts
   → unpdf`, mas `unpdf@2.1.0` está em `package.json` e instalado (falso positivo
   do resolver; comportamento do build/teste não é afetado). Por isso a regra
   **não** foi incluída na config.
4. **Contagem por arquivo vs por aresta:** para as regras de Prisma, cada arquivo
   afetado tem exatamente 1 aresta — números de arquivo e de violação coincidem.

## 6. Pendências desta fase

- [ ] Confirmar a metodologia dos "69 pares de ciclo" do briefing (§2) — ou
      adotar os números medidos aqui (3 SCCs / 8 caminhos) como baseline oficial.
- [ ] Regra de cross-module (módulo → módulo) — propor na Fase 2.
- [ ] `docs/glossary.md` ainda não existe — criar na Fase 1 antes de traduzir
      termos ambíguos (fiado → `customerTab` já é decisão fechada).
- [x] Golden OpenAPI implementado: `src/tests/contract/openapi.golden.json`
      (560 rotas / 717 métodos) + `src/tests/integration/openapiContract.integration.spec.ts`;
      regenerar com `npm run contract:openapi:update` após mudança intencional.
      **Limitação:** cobre rotas/métodos/params/schemas declarados; a maioria das
      rotas não declara `schema` Fastify (só 6 arquivos de rota) — campos de
      body/response e enums de Prisma **não** aparecem no documento. Enriquecer
      o contrato (Zod → JSON Schema nas rotas) é pendência das fases seguintes.
- [x] Inventário de identificadores PT: `npm run audit:portuguese` →
      `docs/architecture/portuguese-identifiers.md` (11.917 ocorrências — 2.358
      identificadores, 3.228 chaves, 3.220 comentários, 2.757 títulos de teste,
      279 strings de log). Regenerar após cada leva de rename.

## 7. Proposta de ordem das fases — Fase 0d

**Critérios:** (1) um módulo por PR (regra do briefing); (2) menos acoplado
primeiro — ordenar por `out` (módulos de que depende), desempate por `in`
(dependentes) e por nº de arquivos; (3) membros de ciclo **por último**;
(4) piloto primeiro. Base: tabela dos 61 módulos medida nesta fase.

| Fase | Escopo | Módulos | PRs |
|---|---|---:|---:|
| **1 — piloto** | `clients` (37 arquivos, out 4, in 8, sem ciclo) | 1 | 1 |
| **2A — folhas** | `out = 1` (33 módulos) | 33 | 33 |
| **2B — médios** | `out = 2–4` sem ciclo (17 módulos) | 17 | 17 |
| **2C — hubs e ciclo** | `out ≥ 5` + membros do SCC (10 módulos) | 10 | 10 |
| **2 total** | | 60 | 60 |
| **3 — front** | por feature (fora do escopo deste PR) | — | — |

**Ordem detalhada (2A → 2C):**

- **2A (33):** monitoring, contact, catalog, copilot, corporate, fiscal, forms,
  integrations, loyalty, pricing, purchasing, quality, recurringPackages,
  visits, wallet, deposits, plans, equipment, showcase, support, clientPortal,
  whatsappAi (in=1) → goals, serviceCategories, staff, vouchers, waitlist
  (in=2) → cases (in=3) → referrals, email (in=4) → notifications (in=5) →
  crm (in=8) → financial (in=14).
- **2B (17):** analytics, nps, cash, expenses, users (out=2) → organizations,
  productReservations, feed, posts, profit, commissions, services, products
  (out=3) → dataExport, payments, dataImport, barbershops (out=4).
  Notas: `dataImport` tem SCC interno (`csvParser ↔ sheetMatrix`) — quebrar no
  PR do próprio módulo; `reputation` (out=3) é membro do SCC grande → movido
  para 2C.
- **2C (10):** subscriptions, auth, packages, admin (hubs sem ciclo; ordem por
  tamanho) → **grupo do ciclo**: reputation → fiado → queue → appointments →
  whatsappOwnerBot → `modules/shared`. O **primeiro PR do grupo** também move
  os membros em `src/shared/` que estão no SCC
  (`shared/useCases/CompleteServiceUseCase`, `shared/infra/queue/*`) para as
  camadas certas — é esse movimento que quebra as arestas; os PRs seguintes só
  consolidam. A regra `domain/application não importa infrastructure` força a
  direção nova da aresta.

**Pergunta aberta (decidir antes da Fase 2):** 60 PRs de back é bastante
volume de review — se o custo dominar, propor agrupamento de folhas minúsculas
(2–3 módulos de ≤6 arquivos por PR) mantendo 1 módulo por PR nos demais.

## 8. Convenção de nomes — Fase 0d

**Vai para inglês (código):** identificadores, comentários/JSDoc, títulos
`describe`/`it`, strings de log internas, códigos de erro, commits, branches.
**Permanece em pt-BR:** textos de tela/labels/toasts, mensagens `message` da
API (catálogo central `src/shared/messages/pt-BR.ts` referenciado por chave em
inglês), templates de e-mail/WhatsApp/push/PDF, seeds visíveis, docs de usuário,
rotas públicas em URL.

**Símbolos e arquivos:**
- `camelCase` funções/variáveis/params; `PascalCase` classes, interfaces, tipos,
  enums; `SCREAMING_SNAKE_CASE` constantes de módulo.
- Arquivo = `PascalCase` quando exporta classe/fábrica (`XController.ts`,
  `XUseCase.ts`), `camelCase` para utilitários (`shareUrls.ts`); spec ao lado
  (`X.spec.ts`; front `X.test.ts(x)`); pastas de módulo em `camelCase`.
- Nomes de campo Prisma/tabela **não mudam nesta fase** (contrato imutável) —
  código interno em inglês + adaptador (DTO/mapper/presenter) na borda.

**Termos ambíguos:** decisão fechada `fiado → customerTab` (nunca `storeCredit`).
O catálogo completo (`docs/glossary.md`, com PT → inglês) é entregável da
**Fase 1** antes do primeiro rename; até lá, não inventar sinônimos — se o
termo não está no catálogo, perguntar.
