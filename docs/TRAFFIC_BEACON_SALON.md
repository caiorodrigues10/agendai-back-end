# Beacon de tráfego das páginas públicas do salão

> Implementação backend do contrato `frontend/docs/TRAFFIC_BEACON_BACKEND_CONTRACT.md`.
> Módulo: `src/modules/traffic/`. Feature flag: `TRAFFIC_BEACON_ENABLED` (mesma do
> beacon global do site).

Este documento descreve **como** o backend recebe, conta, agrega, retém e expõe
o tráfego das páginas públicas de um salão (`/queue/:id`, `/queue/:id/produtos/:productId`,
`/s/:slug`).

---

## 1. Resumo

| Item | Valor |
|---|---|
| Ingestão | `POST /api/ping` (mesmo endpoint do beacon global) |
| Leitura | `GET /api/barbershops/:id/traffic?period=day\|week\|month\|3m\|year` |
| Autorização da leitura | dono do salão (`OWNER`) ou `MASTER_ADMIN` **com `internal:traffic:read`**; `EMPLOYEE` → 403 |
| Contagem por dia civil | `America/Sao_Paulo` |
| Identidade do visitante | HMAC-SHA256 diário de `IP + User-Agent`, TTL 24h, nunca persistido no banco |
| Retenção dos agregados | 13 meses (limpeza no cron de consolidação) |
| Resposta do beacon | **sempre 204**, igual para salão existente e inexistente |

---

## 2. Ingestão (`POST /api/ping`)

### 2.1 Dois caminhos de payload no mesmo endpoint

O beacon global (marketing/intenção) continua mandando apenas `{p, r?}`.
As páginas públicas de salão mandam um segundo payload, com atribuição:

```json
{"p":"/queue/:id","salon":"<uuid>","salonType":"id","kind":"visit","tab":"queue"}
```

| Campo | Obrigatório | Allowlist / formato |
|---|---|---|
| `p` | sim (no payload de salão) | `/queue/:id`, `/queue/:id/produtos/:productId`, `/s/:slug` (padrões literais) |
| `salon` | sim | `A-Za-z0-9` + hífen, 1..100 caracteres |
| `salonType` | sim | `id` \| `slug` |
| `kind` | sim | `visit` \| `tab` |
| `tab` | não | `queue` \| `appointments` \| `profile` — valor fora da allowlist **vira ausente** |
| `r` | não | hostname do referrer |

### 2.2 Validação (silenciosa)

- O schema (`trafficBeaconBodySchema`) **não é estrito**: campos desconhecidos são
  removidos pelo zod e nunca chegam ao contador nem ao banco.
- Um ping de salão é **incoerente** (e descartado) quando:
  - falta `salon`, `salonType` ou `kind`;
  - `kind`/`salonType` estão fora da allowlist;
  - `salon` está fora do charset/tamanho;
  - a **forma** de `salon` não bate com `salonType` (UUID declarado como `slug`
    ou slug declarado como `id`) — o backend **nunca adivinha**;
  - `p` não é uma das três rotas públicas de salão.
- `/queue/:id` **sem** atribuição é incoerente (descartado). `/s/:slug` **sem**
  atribuição continua válido como ping anônimo legado.
- `tab` fora da allowlist é tratado como ausente — **não** descarta o ping.

### 2.3 Descartes e privacidade

- A resposta é **sempre `204`**, com corpo vazio — inclusive para salão
  inexistente, payload malformado, Redis fora, origem não permitida, DNT/GPC,
  bot, prefetch ou cota estourada. Não há sinal de enumeração de ids.
- O motivo do descarte é um **enum fechado** (`disabled`, `excluded`,
  `rate_limited`, `counter_error`, `salon_unresolved`) e é o **único** dado
  que vai para o log (`request.log.debug({ reason })`).
- O log de requisição do Fastify reduz `/api/ping` ao método
  (`trafficRequestSerializer`) — sem URL, host, IP ou porta.
- O rate limit por IP é o **mesmo** do beacon global
  (`TRAFFIC_RATE_LIMIT_MAX`, padrão 120/min).

### 2.4 Regras de contagem

| Evento | `totals.visits` | `totals.visitors` | `sections` | `origins` | beacon global |
|---|---|---|---|---|---|
| `kind:"visit"` | +1 | +1 (hash diário distinto) | +1 na seção derivada | +1 | +1 (área `salon_public`) |
| `kind:"tab"` | — | — | +1 na seção da aba | — | — |

- Seção derivada de `p` + `tab`:
  `profile` (`/s/:slug` ou `tab=profile`), `queue` (`/queue/:id` com `tab=queue`
  ou sem `tab`), `appointments` (`tab=appointments`), `products`
  (`/queue/:id/produtos/:productId`), `other` (fallback).
- A visita do salão **também** entra no beacon global do site (área
  `salon_public`) para preservar as métricas do painel master. Pings `tab`
  nunca entram no beacon global.

---

## 3. Resolução do salão (`salon` + `salonType`)

> ⚠️ **DECISÃO PENDENTE (produto/backend).** O contrato lista três opções para o
> slug de uma organização multiunidade. A **opção 1 — atribuir o ping à
> organização** — está implementada (é a recomendada pelo contrato), mas a
> decisão final continua **pendente**.

| `salonType` | Resolução | Alvo de contagem |
|---|---|---|
| `id` | `Barbershop.id` (UUID) | `b:<barbershopId>` |
| `slug` | `Organization.slug` → organização | `o:<organizationId>` |

A resolução vive **isolada** em um único adapter
(`src/modules/traffic/infra/prismaSalonAttributionResolver.ts`), para que
trocar a decisão (ignorar slug ambíguo, usar a unidade principal, …) não
afete o contador, a consolidação ou o relatório.

Salão/organização inexistente → descarte silencioso (204, sem escrita).

### Quem enxerga o agregado da organização

- O relatório do salão sempre inclui o alvo do **próprio salão** (`b:<id>`).
- O alvo da **organização** (`o:<id>`) entra **apenas** para o dono da
  organização (`Organization.ownerId === user.id`) e para o `MASTER_ADMIN`.
- Um dono de unidade **não** enxerga o tráfego de outra unidade.

> ⚠️ **DÚVIDA ABERTA:** se o dono de cada unidade deveria ver o agregado da
> organização (visão multiunidade). Hoje a leitura é restrita ao dono da
> organização — o mais conservador dentro da opção 1.

---

## 4. Armazenamento

### 4.1 Redis (buffer transitório)

| Chave | Conteúdo | TTL |
|---|---|---|
| `traffic:s:reg:{day}` | conjunto de alvos com ping no dia | 4 dias |
| `traffic:s:v:{day}:{target}` | visitas do dia | 4 dias |
| `traffic:s:h:{day}:{target}` | HLL de hash diário (visitantes) | **24h** |
| `traffic:s:vh:{day}:{HH}:{target}` | visitas da hora | 4 dias |
| `traffic:s:hh:{day}:{HH}:{target}` | HLL de hash diário da hora | **24h** |
| `traffic:s:sv:{day}:{target}:{section}` | visitas da seção (visit + tab) | 4 dias |
| `traffic:s:sh:{day}:{target}:{section}` | HLL de hash diário da seção | **24h** |
| `traffic:s:or:{day}:{target}` | conjunto de hosts de origem | 4 dias |
| `traffic:s:o:{day}:{target}:{host}` | visitas por host de origem | 4 dias |
| `traffic:salt:{day}` | salt HMAC diário (compartilhado com o beacon global) | 48h |

O prefixo `traffic:s:` separa o tráfego de salão do beacon global (`traffic:v:`,
`traffic:h:`, …). Nenhuma chave ou valor contém IP ou user agent em claro: a
identidade gravada é o **hash HMAC diário** (o salt é aleatório, rotativo por
dia civil e nunca sai do Redis).

### 4.2 PostgreSQL (agregados)

Tabelas novas (escopo plataforma, **sem RLS** — ver `docs/RLS-INVENTARIO.md`):

| Tabela | Grão | Colunas |
|---|---|---|
| `salon_traffic_daily` | dia civil × alvo | `day`, `target`, `visits`, `visitors` |
| `salon_traffic_hourly` | dia × hora × alvo | `day`, `hour`, `target`, `visits`, `visitors` |
| `salon_traffic_section_daily` | dia × alvo × seção | `day`, `target`, `section`, `visits`, `visitors` |
| `salon_traffic_origin_daily` | dia × alvo × host | `day`, `target`, `origin`, `visits` |

- `target` é a chave de atribuição (`b:<uuid>` / `o:<uuid>`) — **nunca** o
  identificador público enviado pelo navegador.
- O banco **não** guarda IP, user agent, cookie, hash de visitante, rota nem
  path/query. Só contagens.
- A consolidação é **idempotente**: o upsert usa `GREATEST`, então repetir
  nunca reduz um valor já persistido.

### 4.3 Consolidação e retenção

- Cron `traffic-consolidation` (`5 * * * *`, `America/Sao_Paulo`, com
  `withCronLock`): consolida o dia anterior e o dia corrente (parcial).
- Ao final de cada tick aplica a **retenção de 13 meses**: apaga as linhas de
  `salon_traffic_*` com `day` anterior ao corte (`today - 13 meses`). A
  retenção preexistente do beacon global (`site_traffic_*`) **não** é alterada.
- O hash diário de visitante tem TTL de **24h** (teto de privacidade do
  contrato) e nunca chega ao banco.

---

## 5. Leitura (`GET /api/barbershops/:id/traffic`)

### 5.1 Guardas

`authenticate` → `authorize(["MASTER_ADMIN","OWNER"])` → vínculo com o salão da
rota (403 para quem não é o dono) → `internalTrafficGuard` (só para
`MASTER_ADMIN`) → `validateSchema(salonTrafficQuerySchema, "query")`
→ `checkSubscription` → `setRlsContext`.

- Anônimo → **401**.
- `EMPLOYEE` (mesmo com permissão de relatórios) → **403**.
- Dono de **outro** salão → **403**.
- `MASTER_ADMIN` → **200**, mas só com `internal:traffic:read` (mesma guarda de
  `GET /admin/traffic`): admin interno escopado **sem** essa permissão → **403**
  ("Você não tem permissão para acessar esta área interna").
- `MASTER_ADMIN` com `internal:all`, com `internal:traffic:read` ou sem
  permissões explícitas (acesso total) → **200**.

O `internalTrafficGuard` (`src/shared/infra/http/middlewares/internalTrafficGuard.ts`)
é **condicional**: para `MASTER_ADMIN` roda `verifyInternalAdmin` (que carrega
`permissions` do banco) e depois `requireInternalPermission(internal:traffic:read)`,
na mesma ordem de `admin.routes.ts`; para qualquer outro papel não faz nada — o
acesso do `OWNER` continua definido só por `assertOwnShop` + `checkSubscription`.

### 5.2 Query

A query tem **apenas** `period` (obrigatório, `.strict()`):

| `period` | Janela (móvel) | Granularidade da série |
|---|---|---|
| `day` | hoje | 24 buckets de hora |
| `week` | últimos 7 dias | dia |
| `month` | últimos 30 dias | dia |
| `3m` | 90 dias | semana (seg–dom) |
| `year` | 365 dias | mês |

Não há âncora de data/mês (o frontend não envia). Valor inválido, período
ausente ou parâmetro extra → **400** (padrão de erro do projeto).

### 5.3 Resposta

```json
{
  "success": true,
  "data": {
    "period": {
      "key": "week",
      "label": "Últimos 7 dias",
      "granularity": "day",
      "fromDay": "2026-11-09",
      "toDay": "2026-11-15",
      "prevFromDay": "2026-11-02",
      "prevToDay": "2026-11-08",
      "timezone": "America/Sao_Paulo",
      "dataFrom": "2026-10-01"
    },
    "generatedAt": "2026-11-15T12:00:00.000Z",
    "beaconEnabled": true,
    "totals": { "visits": 42, "visitors": 30, "visitorsBasis": "sum_of_daily_distinct" },
    "prevTotals": { "visits": 20, "visitors": 12, "visitorsBasis": "sum_of_daily_distinct" },
    "deltaPct": { "visits": 110, "visitors": 150 },
    "series": [
      { "bucketStart": "2026-11-15", "label": "15/11", "visits": 12, "visitors": 9, "partial": true }
    ],
    "sections": [
      { "section": "profile", "visits": 20, "visitors": 15 },
      { "section": "queue", "visits": 12, "visitors": 8 },
      { "section": "appointments", "visits": 6, "visitors": 5 },
      { "section": "products", "visits": 4, "visitors": 3 },
      { "section": "other", "visits": 1, "visitors": 1 }
    ],
    "origins": [{ "host": "www.instagram.com", "visits": 14 }]
  }
}
```

Regras:

- `totals`/`series` contam **apenas** `kind:"visit"`; `sections` soma as visitas
  da seção **mais** as abas (`kind:"tab"`).
- `visitorsBasis`: `daily_distinct` (janela de 1 dia) ou
  `sum_of_daily_distinct` (janelas maiores — a mesma pessoa pode contar em dias
  diferentes).
- `partial` marca o bucket corrente (e os buckets recortados pelas bordas da
  janela móvel).
- `prevTotals`/`deltaPct` comparam com a janela **imediatamente anterior**, do
  mesmo tamanho. Sem tráfego na janela anterior → `prevTotals: null` e
  `deltaPct: null`. Base zero → `deltaPct` do campo é `null`.
- `beaconEnabled` reflete `TRAFFIC_BEACON_ENABLED` no servidor.
- Sem dados: `series`, `sections` e `origins` vêm **vazios** (a UI mostra
  “Ainda sem visitas registradas”). `sections` só sai vazio junto; havendo
  dados, as **cinco** seções aparecem (com zero quando não houve ping).
- Nunca expõe dados de outro salão, nem hash, IP ou user agent.

---

## 6. Arquivos

| Camada | Arquivo |
|---|---|
| Domínio | `domain/salonTraffic.ts`, `domain/salonPeriodWindows.ts`, `domain/beaconRequest.ts` |
| Schemas | `schemas/trafficSchemas.ts` (`trafficBeaconBodySchema`, `salonTrafficQuerySchema`) |
| Portas | `application/ports/ISalonAttributionResolver.ts`, `ISalonTrafficReportRepository.ts` |
| Use cases | `application/useCases/RecordSalonTrafficUseCase.ts`, `GetSalonTrafficReportUseCase.ts` |
| Infra | `infra/redisTrafficCounter.ts`, `infra/trafficKeys.ts`, `infra/redisTrafficConsolidationSource.ts`, `infra/trafficConsolidationRepository.ts`, `infra/trafficConsolidation.cron.ts`, `infra/prismaSalonAttributionResolver.ts`, `infra/prismaSalonTrafficReportRepository.ts` |
| Apresentação | `presentation/TrafficBeaconController.ts`, `presentation/SalonTrafficReportController.ts` |
| Rotas | `shared/infra/http/routes/barbershops.routes.ts` |
| Middlewares | `shared/infra/http/middlewares/internalTrafficGuard.ts` (permissão interna de tráfego, só para `MASTER_ADMIN`) |
| Banco | `prisma/schema.prisma` + `prisma/migrations/20261117120000_salon_traffic_attribution/` |

---

## 7. Operação

- **Feature flag**: `TRAFFIC_BEACON_ENABLED` (default `false`). Com a flag
  desligada, o beacon responde 204 sem contar e o relatório devolve
  `beaconEnabled: false`.
- **Latência do relatório**: os dados aparecem depois da consolidação (cron
  horário). Para uma conferência manual, rode
  `consolidateTrafficDays(new Date())`.
- **Rollout**: backend primeiro (migration + deploy), frontend depois.
- **Rollback**: desligar `TRAFFIC_BEACON_ENABLED` (o beacon global e o relatório
  master seguem funcionando).
