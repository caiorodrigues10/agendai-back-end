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

**Sobre o A6 — nomes reais das colunas de data/hora** (conferidos em
`prisma/schema.prisma`, modelo `Appointment`, linhas 1029-1030):

```prisma
date   DateTime  @db.Date
time   String    @db.VarChar(5)
```

`date` é um `DateTime` truncado em data (`@db.Date`) e `time` é uma **string**
`"HH:MM"` (`VarChar(5)`), não um timestamp. O índice composto
`(barbershopId, date, time)` ordena `date` como data e `time` lexicograficamente
— que é exatamente a ordem já usada pelo repositório
(`orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }]`). Nenhum
`time` numérico existe na tabela.

### 2.1 Análise dos índices de `Appointment` (listagem da Fase 2)

`@@index` declarados no modelo `Appointment` (`prisma/schema.prisma`, linhas
1095-1101):

```prisma
@@index([barbershopId, staffId, date, status])
@@index([barbershopId, completedAt])
@@index([clientId])
@@index([clientPackageId])
@@index([seriesId, occurrenceIndex])
@@index([visitId])
@@index([date])
```

| Consulta da listagem | Índice que a cobre | Situação |
|---|---|---|
| `(barbershopId, staffId, date)` | `@@index([barbershopId, staffId, date, status])` — casa pelo prefixo | **coberta** |
| `(barbershopId, date)` — listagem por data **sem** profissional | nenhuma | **falta** |
| `(barbershopId, status)` — filtro de status (inclusive em lista) | nenhuma | **falta** |
| `(barbershopId, serviceId)` — filtro por serviço | nenhuma | **falta** |

Por que as três últimas faltam:

- `@@index([barbershopId, staffId, date, status])` **não** serve a consulta por
  data sem profissional: `staffId` é a segunda coluna do índice e não é
  filtrado nessa consulta, então o Postgres não consegue usá-lo como prefixo.
- `@@index([date])` sozinho não ajuda: não contém `barbershopId`, e a listagem
  é sempre por salão.
- Não há índice nenhum sobre `status` ou `serviceId` em `Appointment`.

Proposta (somente proposta, nada aplicado — ver seção 4):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "appointments_barbershopId_date_time_idx"
  ON "appointments" ("barbershopId", "date", "time");       -- A6
CREATE INDEX CONCURRENTLY IF NOT EXISTS "appointments_barbershopId_status_date_idx"
  ON "appointments" ("barbershopId", "status", "date");      -- filtro de status
CREATE INDEX CONCURRENTLY IF NOT EXISTS "appointments_barbershopId_serviceId_date_idx"
  ON "appointments" ("barbershopId", "serviceId", "date");   -- filtro por serviço
```

E, no `schema.prisma`, para não gerar drift (ver o passo 6 da seção 4):

```prisma
model Appointment {
  // ...
  @@index([barbershopId, date, time])
  @@index([barbershopId, status, date])
  @@index([barbershopId, serviceId, date])
}
```

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
   # migration.sql: MESMOS índices, porém com CREATE INDEX IF NOT EXISTS
   # SEM "CONCURRENTLY" — ver a nota abaixo. NUNCA usar CONCURRENTLY aqui.
   npx prisma migrate resolve --applied <timestamp>_indices_paginacao
   ```

   > **O `migration.sql` do histórico NÃO pode usar `CREATE INDEX
   > CONCURRENTLY`.** O `prisma migrate deploy` executa a migration dentro de
   > uma transação e o `CONCURRENTLY` falha ali com
   > `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` — o que
   > quebraria banco novo e CI. No arquivo de histórico use
   > `CREATE INDEX IF NOT EXISTS` **sem** `CONCURRENTLY`; o `CONCURRENTLY` fica
   > apenas no passo 4 (aplicação manual em produção, via `psql`).
   >
   > O prefixo `<timestamp>` **deve** ser maior que o maior prefixo já
   > existente em `prisma/migrations/` (regra do `backend/AGENTS.md`).

6. **Declarar os índices no `schema.prisma` — sem isso há drift.** O
   `prisma migrate diff` compara o **datamodel** com o banco: um índice que
   existe no banco mas não está declarado no schema aparece como **drift** e o
   passo de validação abaixo acusaria código `2` mesmo com tudo aplicado
   corretamente.

   **Grupo A e B (btree) — declarar como `@@index` nos modelos:**

   ```prisma
   model SalonClient {
     // ...
     @@index([barbershopId, name])        // A1
     @@index([barbershopId, lastVisitAt])  // A2
     @@index([barbershopId, createdAt])    // A3
   }

   model Fiado {
     // ...
     @@index([barbershopId, status, createdAt])  // A4
     @@index([barbershopId, dueDate])             // A5
     @@index([clientId, status])                  // B1
   }

   model ClientPackage {
     // ...
     @@index([clientId, status])  // B2
   }

   model Appointment {
     // ...
     @@index([barbershopId, date, time])  // A6
   }
   ```

   O nome do índice que o Prisma gera precisa bater com o do passo 4
   (`<tabela>_<colunas>_idx`), para que o `migrate diff` não acuse diferença
   de nome.

   **Grupo C (GIN com `gin_trgm_ops`) — caminho diferente.** O Prisma só
   declara índice GIN com operador customizado se a extensão estiver declarada
   no schema. Hoje o `schema.prisma` tem:

   ```prisma
   generator client {
     provider        = "prisma-client-js"
     previewFeatures = ["driverAdapters"]
   }
   ```

   — **sem `postgresqlExtensions`**. O caminho é:

   1. Habilitar a preview feature no generator:
      ```prisma
      generator client {
        provider        = "prisma-client-js"
        previewFeatures = ["driverAdapters", "postgresqlExtensions"]
      }
      ```
   2. Declarar a extensão no datasource:
      ```prisma
      datasource db {
        provider  = "postgresql"
        url       = env("DATABASE_URL")
        directUrl = env("DIRECT_URL")
        extensions = [pg_trgm(map: "pg_trgm", schema: "public")]
      }
      ```
   3. Declarar os índices GIN com operador raw:
      ```prisma
      model SalonClient {
        // ...
        @@index([name(ops: raw("gin_trgm_ops"))], type: Gin)       // C1
        @@index([whatsapp(ops: raw("gin_trgm_ops"))], type: Gin)    // C2
      }
      ```

   **Nada disso foi feito agora** — o schema segue intocado nesta fase. O
  habilitar `postgresqlExtensions` muda o comportamento do Prisma em relação
   à extensão (o cliente passa a gerenciar a criação dela), o que exige
   validação própria antes de ser adotado.

7. **Validar** conforme `docs/RUNBOOK_MIGRATIONS.md` (seção "4. Pós-validação"):
   ```bash
   npx prisma migrate status
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
   ```
   O código `0` significa ausência de diferença; `2` significa drift — parar e
   investigar.
8. **Medir** antes/depois com `EXPLAIN (ANALYZE, BUFFERS)` nas consultas de
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

**Resultado real da consulta de RLS (2026-11-04):**

| tablename | rowsecurity | forcerowsecurity |
|---|---|---|
| `appointments` | `true` | `true` |
| `client_packages` | `true` | `true` |
| `fiados` | `true` | `true` |
| `salon_clients` | `true` | `true` |

| papel | rolsuper | rolbypassrls |
|---|---|---|
| `agendai` | `true` | `true` |

Políticas ativas nas quatro tabelas: `tenant_isolation` (comando `*`, ou seja,
vale para `SELECT`, `INSERT`, `UPDATE` e `DELETE`).

**Achado relevante:** o papel `agendai` é **superuser com `BYPASSRLS`**
(`rolsuper = true`, `rolbypassrls = true`). As tabelas têm `tenant_isolation`
com `ROW LEVEL SECURITY` **e `FORCE ROW LEVEL SECURITY`** (confirmado na
tabela acima), mas superusuário e papéis com `BYPASSRLS` **sempre** ignoram
RLS — o `FORCE` só atinge o dono da tabela, não o superusuário. Prova prática:
com `requestContext` de um salão, a listagem de clientes devolveu clientes de
**outros salões** (3 de 3). Ou seja, **no banco de dev a RLS não filtra nada**;
o isolamento entre salões depende integralmente do `where` construído pela
aplicação. Os testes E2E de dois salões validam pelo `where`, não pela RLS.

---

## 7. Isolamento por salão no ambiente de testes

### 7.1 O achado

O papel usado pela aplicação nos bancos locais (`agendai`) é **SUPERUSER** e
tem **BYPASSRLS**. Em PostgreSQL, esses papéis **sempre** ignoram as políticas
de RLS, mesmo com `FORCE ROW LEVEL SECURITY` — o `FORCE` apenas faz a política
valer para o *dono* da tabela.

Consequência prática: **nos bancos de dev e de teste, o isolamento por salão no
nível do banco não é exercido**. Qualquer consulta que forgets de filtrar por
`barbershopId` leria dados de todos os salões sem erro. O único filtro real é o
`where` que a aplicação monta.

### 7.2 Proposta de papel de aplicação sem privilégios (NÃO EXECUTAR)

Proposta, para discussão — **nada foi executado e nenhum papel foi criado**.
Requer aprovação e janela de manutenção, porque mexe em permissões do banco:

```sql
-- PROPOSTA — não executada. Criar papel de aplicação sem SUPERUSER/BYPASSRLS.
CREATE ROLE agendai_app LOGIN PASSWORD '<via .env / PGPASSFILE, nunca na linha de comando>';

-- Sem privilégios de superusuário e sem bypass de RLS.
ALTER ROLE agendai_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- Acesso de leitura/escrita apenas ao schema public.
GRANT USAGE ON SCHEMA public TO agendai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agendai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agendai_app;

-- O papel de aplicação precisa ser dono das tabelas para o FORCE RLS valer
-- (ou a policy precisa ser reescrita para o novo papel).
ALTER TABLE salon_clients    OWNER TO agendai_app;
ALTER TABLE fiados           OWNER TO agendai_app;
ALTER TABLE client_packages  OWNER TO agendai_app;
ALTER TABLE appointments     OWNER TO agendai_app;

-- Default privileges para objetos futuros.
ALTER DEFAULT PRIVILEGES FOR ROLE agendai_app IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agendai_app;
```

Depois de criado, o papel passa a ser o dono das tabelas, e aí o
`FORCE ROW LEVEL SECURITY` passa a valer: a policy `tenant_isolation` filtra
pelo `app.current_barbershop_id` (que o cliente Prisma define via `SET LOCAL` —
ver `src/libs/prismaExtensions.ts`).

**Ordem de implantação sugerida:** (1) criar o papel; (2) rodar os testes de
isolamento com ele; (3) só depois migrar a aplicação e o banco de dev para ele.
Enquanto isso, o papel antigo continua em uso.

### 7.3 Consulta de verificação para staging/produção

**Não executar nos bancos locais** (lá o papel já é superuser e o resultado
seria sempre "bypass"). Rodar em staging/produção, somente leitura:

```sql
-- 1) Privilégios do papel efetivamente usado pela aplicação
SELECT r.rolname::text            AS role,
       r.rolsuper                 AS superuser,
       r.rolbypassrls             AS bypassrls,
       r.rolinherit               AS rolinherit,
       pg_has_role(r.rolname, 'agendai', 'MEMBER') AS membro_de_agendai
FROM pg_roles r
WHERE r.rolname = current_user;

-- 2) RLS por tabela (a tabela real do ambiente alvo)
SELECT c.relname::text        AS tabela,
       c.relrowsecurity       AS rls,
       c.relforcerowsecurity  AS force_rls,
       pg_get_userbyid(c.relowner)::text AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('salon_clients','fiados','client_packages','appointments')
ORDER BY c.relname;

-- 3) Políticas e suas expressões
SELECT c.relname::text AS tabela,
       pol.polname::text AS politica,
       pol.polcmd::text  AS comando,
       pg_get_expr(pol.polqual, pol.polrelid) AS usando_qual,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS usando_check
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('salon_clients','fiados','client_packages','appointments')
ORDER BY c.relname, pol.polname;

-- 4) Efetividade real: o papel da aplicação é dono das tabelas?
--    Se 'sim' e force_rls = true, a policy passa a valer para ele.
SELECT c.relname::text AS tabela,
       pg_get_userbyid(c.relowner)::text AS owner,
       (pg_get_userbyid(c.relowner)::text = current_user) AS sou_o_dono
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('salon_clients','fiados','client_packages','appointments')
ORDER BY c.relname;
```

**Leitura do resultado:** se `superuser = true` **ou** `bypassrls = true` para
o papel da aplicação, a RLS **não protege nada** nesse ambiente — o isolamento
depende só do `where`. Se `superuser = false`, `bypassrls = false` e o papel
for dono das tabelas (`sou_o_dono = true`) com `force_rls = true`, a policy
`tenant_isolation` passa a valer de fato.
