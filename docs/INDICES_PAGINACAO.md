# Proposta de índices — paginação, busca e ordenação (Fase 2)

**Status: PROPOSTA. Nada foi aplicado. Não há migration correspondente.**

Documento de referência para a padronização de paginação e filtros que está
sendo feita na Fase 2. Os índices aqui listados **não existem** no banco; a
aplicação depende de aprovação e de seguir o procedimento descrito na seção
[Procedimento de aplicação](#procedimento-de-aplicação).

Nomes de tabela conferidos pelo `@@map` de `prisma/schema.prisma` e validados
contra `pg_indexes` do banco (2026-11-04):

| Model Prisma | `@@map` | Tabela real |
|---|---|---|
| `SalonClient` | `@@map("salon_clients")` | `salon_clients` |
| `Fiado` | `@@map("fiados")` | `fiados` |
| `ClientPackage` | `@@map("client_packages")` | `client_packages` |
| `Appointment` | `@@map("appointments")` | `appointments` |

---

## 1. Índices que já existem (não recriar)

 conferidos em `pg_indexes` no banco `agendai`:

### `salon_clients`

| Índice | Colunas |
|---|---|
| `salon_clients_pkey` | `id` (único) |
| `salon_clients_barbershopId_normalizedWhatsapp_key` | `barbershopId, normalizedWhatsapp` (único) |
| `salon_clients_barbershopId_idx` | `barbershopId` |
| `salon_clients_whatsapp_idx` | `whatsapp` |

### `fiados`

| Índice | Colunas |
|---|---|
| `fiados_pkey` | `id` (único) |
| `fiados_barbershopId_idx` | `barbershopId` |
| `fiados_barbershopId_status_idx` | `barbershopId, status` |
| `fiados_status_idx` | `status` |
| `fiados_clientId_idx` | `clientId` |
| `fiados_dueDate_idx` | `dueDate` |
| `fiados_whatsapp_idx` | `whatsapp` |
| `fiados_retailSaleId_key` | `retailSaleId` (único) |

### `client_packages`

| Índice | Colunas |
|---|---|
| `client_packages_pkey` | `id` (único) |
| `client_packages_barbershopId_idx` | `barbershopId` |
| `client_packages_clientId_idx` | `clientId` |
| `client_packages_status_idx` | `status` |
| `client_packages_expiresAt_idx` | `expiresAt` |

### `appointments`

| Índice | Colunas |
|---|---|
| `appointments_pkey` | `id` (único) |
| `appointments_barbershopId_staffId_date_status_idx` | `barbershopId, staffId, date, status` |
| `appointments_barbershopId_completedAt_idx` | `barbershopId, completedAt` |
| `appointments_date_idx` | `date` |
| `appointments_clientId_idx` | `clientId` |
| `appointments_clientPackageId_idx` | `clientPackageId` |
| `appointments_visitId_idx` | `visitId` |
| `appointments_seriesId_occurrenceIndex_idx` | `seriesId, occurrenceIndex` |

---

## 2. Proposta — grupo A: btree para ordenação e faixas de data

Ordenar por uma coluna sem índice composto obriga o Postgres a ordenar o
conjunto filtrado em memória (`Sort` + heap), e o custo cresce com o volume do
salão. O padrão usado aqui é `(barbershopId, <campo>)`: a listagem sempre
filtra por salão, então o índice composto serve ao filtro **e** à ordenação.

| # | Tabela | Índice | Motivo |
|---|---|---|---|
| A1 | `salon_clients` | `(barbershopId, name)` | `sort=name` e desempate estável da listagem de clientes |
| A2 | `salon_clients` | `(barbershopId, lastVisitAt)` | `sort=lastVisitAt` e faixa do filtro `inactiveDays` (`lastVisitAt < limite`) |
| A3 | `salon_clients` | `(barbershopId, createdAt)` | `sort=createdAt` e faixa do filtro `createdFrom/createdTo` |
| A4 | `fiados` | `(barbershopId, status, createdAt)` | listagem de fiados por status + ordenação por data de criação |
| A5 | `fiados` | `(barbershopId, dueDate)` | ordenação por vencimento e filtro de atraso (`dueDate < hoje`) |
| A6 | `appointments` | `(barbershopId, date, time)` | listagem por data sem filtro de profissional (o índice atual só cobre `(barbershopId, staffId, date, status)`) |

### Proposta — grupo B: relação (some/none)

Os filtros por relação (`hasOpenFiado`, `hasActivePackage`) usam
`fiados.clientId` e `client_packages.clientId`. O índice ideal traz o status
junto, porque o `some` sempre filtra por status:

| # | Tabela | Índice | Motivo |
|---|---|---|---|
| B1 | `fiados` | `(clientId, status)` | `hasOpenFiado` — `some` por cliente com status `PENDING/PARTIAL` |
| B2 | `client_packages` | `(clientId, status)` | `hasActivePackage` — `some` por cliente com status `ACTIVE` |

---

## 3. Proposta — grupo C: busca textual (`pg_trgm` + GIN)

A busca de clientes usa `name ILIKE '%termo%'` e `whatsapp LIKE '%dígitos%'`.
Um `ILIKE` com `%` no início **não usa btree** — o Postgres faz varredura
sequencial da tabela. A extensão `pg_trgm` resolve isso com índice GIN sobre
`gin_trgm_ops`.

### 3.1 Situação atual da extensão

Consulta somente leitura em `pg_extension` (2026-11-04):

```
plpgsql (1.0)
```

**`pg_trgm` NÃO está instalado** nos bancos `agendai` (dev) e `agendai_db`
(testes). A extensão precisa ser habilitada antes de criar os índices GIN.

> `CREATE EXTENSION` exige privilégio de superusuário (ou a trusting role da
> extensão). O usuário do banco `agendai` é superuser nos bancos locais, mas em
> staging/produção o papel pode não ter esse privilégio — confirmar antes.

### 3.2 Habilitar a extensão

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 3.3 Índices GIN

| # | Tabela | Índice | Motivo |
|---|---|---|---|
| C1 | `salon_clients` | GIN (`name gin_trgm_ops`) | busca por nome do cliente (`ILIKE '%termo%'`) |
| C2 | `salon_clients` | GIN (`whatsapp gin_trgm_ops`) | busca por dígitos do WhatsApp (`LIKE '%dígitos%'`) |

`whatsapp` é `VarChar(20)` e `normalizedWhatsapp` é `VarChar(11)`. O índice C2
cobre a coluna `whatsapp` usada pela listagem de clientes. Para a coluna
`normalizedWhatsapp`, considerar C3 se a busca passar a usar essa coluna:

```sql
-- C3 (opcional): GIN em normalized_whatsapp
CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_normalizedWhatsapp_trgm_idx"
  ON "salon_clients" USING gin ("normalizedWhatsapp" gin_trgm_ops);
```

### 3.4 Observação sobre `mode: "insensitive"`

O Prisma traduz `mode: "insensitive"` para `ILIKE`. O operador `ILIKE` é
case-insensitive por padrão, então o índice GIN com `gin_trgm_ops` (que
opera sobre `LIKE`/`ILIKE`) é compatível.

---

## 4. Procedimento de aplicação

> **Regra do `docs/RUNBOOK_MIGRATIONS.md`:** o `prisma migrate deploy` executa
> cada migration dentro de uma transação. `CREATE INDEX CONCURRENTLY` **não
> roda dentro de transação** e falha com
> `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`.
> Portanto os índices deste documento **não** vão em `migration.sql`.

Procedimento, na ordem:

1. **Aprovar** este documento (nenhuma mudança de código depende destes
   índices — a Fase 2 segue funcionando sem eles).
2. **Backup** do banco alvo, conforme `docs/RUNBOOK_MIGRATIONS.md` (seção
   "Fluxo de deploy → 1. Preparação"):
   ```bash
   export PGHOST='<host>' PGPORT='5432' PGUSER='<user>' PGDATABASE='<database>'
   pg_dump --format=custom --file="backup_pre_indices_$(date +%Y%m%d_%H%M%S).dump"
   ```
   Fornecer a senha por `PGPASSFILE` — nunca na linha de comando.
3. **Habilitar a extensão** (uma vez, por banco):
   ```bash
   psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
   ```
4. **Criar os índices fora do Prisma**, cada comando em sua própria transação
   implícita (o `CONCURRENTLY` exige isso):
   ```bash
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_barbershopId_name_idx" ON "salon_clients" ("barbershopId", "name");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_barbershopId_lastVisitAt_idx" ON "salon_clients" ("barbershopId", "lastVisitAt");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_barbershopId_createdAt_idx" ON "salon_clients" ("barbershopId", "createdAt");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "fiados_clientId_status_idx" ON "fiados" ("clientId", "status");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "client_packages_clientId_status_idx" ON "client_packages" ("clientId", "status");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_name_trgm_idx" ON "salon_clients" USING gin ("name" gin_trgm_ops);'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_whatsapp_trgm_idx" ON "salon_clients" USING gin ("whatsapp" gin_trgm_ops);'
   ```
   Índice inválido deixado por um `CREATE INDEX CONCURRENTLY` interrompido
   precisa ser removido antes de recriar:
   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS "salon_clients_barbershopId_name_idx";
   ```
5. **Alinhar o histórico do Prisma.** Os índices criados à mão não aparecem em
   `prisma/migrations/`. Para o `migrate status` continuar coerente, criar a
   pasta da migration com o SQL e marcá-la como aplicada — procedimento de
   `docs/RUNBOOK_MIGRATIONS.md` ("Uso excepcional de `migrate resolve`"):
   ```bash
   mkdir -p prisma/migrations/<timestamp>_indices_paginacao
   # migration.sql com os mesmos CREATE INDEX (para o histórico ficar completo)
   npx prisma migrate resolve --applied <timestamp>_indices_paginacao
   ```
   O prefixo `<timestamp>` **deve** ser maior que o maior prefixo já existente
   em `prisma/migrations/` (regra do `backend/AGENTS.md`).
6. **Validar** conforme `docs/RUNBOOK_MIGRATIONS.md` (seção "4. Pós-validação"):
   ```bash
   npx prisma migrate status
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
   ```
   O código `0` significa ausência de diferença; `2` significa drift — parar e
   investigar.
7. **Medir** antes/depois com `EXPLAIN (ANALYZE, BUFFERS)` nas consultas de
   listagem para confirmar o uso do índice (`Index Scan` em vez de
   `Seq Scan` + `Sort`).

---

## 5. O que acontece se nada for aplicado

A Fase 2 funciona sem estes índices. O custo é o Postgres ordenar em memória a
listagem filtrada de cada salão. O impacto é proporcional ao volume por salão
e foi aceito durante a Fase 2 — os filtros novos não degradam o que já
existia, apenas adicionam opções.

---

## 6. Registro das consultas somente leitura usadas na verificação

Executadas em 2026-11-04 contra `agendai` (dev) e `agendai_db` (testes), sem
alterar dados:

```sql
-- extensões instaladas
SELECT extname::text, extversion::text FROM pg_extension ORDER BY extname;

-- índices por tabela
SELECT indexname::text, indexdef::text
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = '<tabela>'
ORDER BY indexname;

-- RLS efetivo
SELECT current_user::text, r.rolsuper, r.rolbypassrls
FROM pg_roles r WHERE r.rolname = current_user;

SELECT c.relname::text, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN
  ('salon_clients','fiados','client_packages','appointments');
```

**Achado relevante:** o papel `agendai` é **superuser com `BYPASSRLS`**
(`rolsuper = true`, `rolbypassrls = true`). As tabelas têm `tenant_isolation`
com `ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`, mas superusuário e
papéis com `BYPASSRLS` **sempre** ignoram RLS — o `FORCE` só atinge o dono da
tabela. Prova prática: com `requestContext` de um salão, a listagem de
clientes devolveu clientes de **outros salões** (3 de 3). Ou seja, **no banco
de dev a RLS não filtra nada**; o isolamento entre salões depende
integralmente do `where` construído pela aplicação. Os testes E2E de dois
salões validam pelo `where`, não pela RLS.
