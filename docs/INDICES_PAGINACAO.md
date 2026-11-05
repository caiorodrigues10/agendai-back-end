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

### `expenses`

| Índice | Colunas |
|---|---|
| `expenses_pkey` | `id` (único) |
| `expenses_barbershopId_idx` | `barbershopId` |
| `expenses_barbershopId_referenceDate_idx` | `barbershopId, referenceDate` |
| `expenses_categoryId_idx` | `categoryId` |
| `expenses_referenceDate_idx` | `referenceDate` |
| `expenses_paidAt_idx` | `paidAt` |
| `expenses_type_idx` | `type` |
| `expenses_inventoryReceiptId_key` | `inventoryReceiptId` (único) |

### `commission_entries`

| Índice | Colunas |
|---|---|
| `commission_entries_pkey` | `id` (único) |
| `commission_entries_barbershopId_createdAt_idx` | `barbershopId, createdAt` |
| `commission_entries_professionalId_createdAt_idx` | `professionalId, createdAt` |
| `commission_entries_queueItemId_professionalId_key` | `queueItemId, professionalId` (único) |
| `commission_entries_appointmentId_professionalId_key` | `appointmentId, professionalId` (único) |

### `users`

| Índice | Colunas |
|---|---|
| `users_pkey` | `id` (único) |
| `users_email_key` | `email` (único) |
| `users_cpf_key` | `cpf` (único) |
| `users_cpf_idx` | `cpf` |
| `users_deletedAt_idx` | `deletedAt` |
| `users_googleSub_key` | `googleSub` (único) |

Não existe **nenhum** índice com `barbershopId` — a listagem da equipe do dono
(`GET /api/users`) filtra sempre por salão (ver seção 2.5).

### `services`

| Índice | Colunas |
|---|---|
| `services_pkey` | `id` (único) |

Não existe **nenhum** índice com `barbershopId` — a listagem de serviços
(`GET /api/services`) filtra sempre por salão (ver seção 2.6).

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
| A7 | `fiados` | `(barbershopId, createdAt)` | ordenação padrão da listagem de fiados (`createdAt desc`) e faixa `from/to` (em `createdAt`) |
| A8 | `expenses` | `(barbershopId, paidAt)` | filtro `payment=paid/pending` (derivado de `paidAt`) |
| A9 | `expenses` | `(barbershopId, dueDate)` | filtro `payment=overdue` e `sort=dueDate` |
| A10 | `expenses` | `(barbershopId, amount)` | `sort=amount` |
| A11 | `expenses` | `(barbershopId, createdAt)` | `sort=createdAt` |
| A12 | `commission_entries` | `(barbershopId, professionalId, createdAt)` | listagem de comissões por período + profissional (prioridade) |
| A13 | `commission_entries` | `(barbershopId, serviceId)` | filtro `serviceId` da listagem de comissões |
| A14 | `commission_entries` | `(barbershopId, amount)` | `sort=valor` |
| A15 | `users` | `(barbershopId, name)` | listagem da equipe do dono: filtro por salão + `sort=nome` |
| A16 | `users` | `(barbershopId, createdAt)` | listagem da equipe do dono: ordenação padrão (`createdAt asc`) |
| A17 | `services` | `(barbershopId, name)` | listagem de serviços: filtro por salão + ordenação padrão (`name asc`) — **opcional** |
| A18 | `services` | `(barbershopId, publicBookable, name)` | catálogo público: filtro `publicBookable` + ordenação por nome — **recomendado** |
| A19 | `services` | `(barbershopId, categoryId)` | filtro `categoryId` da listagem de serviços — **opcional** |
| A20 | `services` | `(barbershopId, price)` | `sort=preco` — **opcional** |
| A21 | `services` | `(barbershopId, avgTimeMinutes)` | `sort=duracao` — **opcional** |
| A22 | `services` | `(barbershopId, createdAt)` | `sort=criado` — **opcional** |
| A23 | `users` | `(role, createdAt)` | equipe interna do admin: escopo por papel + ordenação padrão (`createdAt desc`) — **opcional** |
| A24 | `users` | `(role, deletedAt)` | equipe interna do admin: filtro de membro removido (`status=inactive`) — **opcional** |

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
1094-1100):

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

### 2.2 Análise dos índices de `Fiado` (listagem da Fase 2)

`@@index` declarados no modelo `Fiado` (`prisma/schema.prisma`, linhas
2277-2282):

```prisma
@@index([barbershopId])
@@index([status])
@@index([whatsapp])
@@index([clientId])
@@index([dueDate])
@@index([barbershopId, status])
```

| Consulta da listagem | Índice que a cobre | Situação |
|---|---|---|
| `(barbershopId, status)` | `@@index([barbershopId, status])` — casa pelo prefixo | **coberta** |
| `(barbershopId, status, createdAt)` — filtro de status **+** ordenação por criação | nenhuma | **falta** (A4) |
| `(barbershopId, dueDate)` — `dueFrom/dueTo`, `overdue` e `sort=dueDate` | nenhuma | **falta** (A5) |
| `(barbershopId, createdAt)` — ordenação padrão (`createdAt desc`) e faixa `from/to` | nenhuma | **falta** (A7) |
| `(barbershopId, clientId)` — filtro por cliente do CRM | `@@index([clientId])` sozinho (sem o salão) | **parcial** |

Por que A4, A5 e A7 faltam:

- `@@index([barbershopId, status])` cobre o par `(barbershopId, status)`, mas a
  ordenação da listagem de fiados é por `createdAt` (padrão) — sem `createdAt`
  no índice, o Postgres ainda precisa ordenar o conjunto filtrado em memória.
- `@@index([dueDate])` não contém `barbershopId`: como a listagem é sempre por
  salão, ele não serve como prefixo. `@@index([barbershopId])` também não
  ajuda — não tem `dueDate`.
- Não há índice nenhum com `createdAt` junto do salão, então o ordenamento
  padrão da listagem (`createdAt desc, id desc`) e a faixa `from/to`
  (em `createdAt`) não têm apoio.
- `@@index([clientId])` existe, mas o filtro da listagem combina
  `barbershopId + clientId`; um índice composto deixaria a busca por fiado de
  um cliente direto no índice.

Proposta (somente proposta, nada aplicado — ver seção 4):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "fiados_barbershopId_status_createdAt_idx"
  ON "fiados" ("barbershopId", "status", "createdAt");   -- A4
CREATE INDEX CONCURRENTLY IF NOT EXISTS "fiados_barbershopId_dueDate_idx"
  ON "fiados" ("barbershopId", "dueDate");                -- A5
CREATE INDEX CONCURRENTLY IF NOT EXISTS "fiados_barbershopId_createdAt_idx"
  ON "fiados" ("barbershopId", "createdAt");              -- A7
```

E, no `schema.prisma`, para não gerar drift (ver o passo 6 da seção 4):

```prisma
model Fiado {
  // ...
  @@index([barbershopId, status, createdAt])
  @@index([barbershopId, dueDate])
  @@index([barbershopId, createdAt])
}
```

### 2.3 Análise dos índices de `Expense` (listagem da Fase 2)

`@@index` declarados no modelo `Expense` (`prisma/schema.prisma`, linhas
2228-2233):

```prisma
@@index([barbershopId])
@@index([categoryId])
@@index([referenceDate])
@@index([paidAt])
@@index([type])
@@index([barbershopId, referenceDate])
```

| Consulta da listagem | Índice que a cobre | Situação |
|---|---|---|
| `(barbershopId, referenceDate)` — período e ordenação padrão | `@@index([barbershopId, referenceDate])` | **coberta** |
| `(barbershopId, paidAt)` — filtro `payment=paid/pending` | nenhuma | **falta** (A8) |
| `(barbershopId, dueDate)` — filtro `payment=overdue` e `sort=dueDate` | nenhuma | **falta** (A9) |
| `(barbershopId, amount)` — `sort=amount` | nenhuma | **falta** (A10) |
| `(barbershopId, createdAt)` — `sort=createdAt` | nenhuma | **falta** (A11) |
| `categoryId` — filtro por categoria | `@@index([categoryId])` (sem o salão) | **parcial** |
| `type` — filtro por tipo | `@@index([type])` (sem o salão) | **parcial** |

Por que A8–A11 faltam:

- `@@index([paidAt])` e `@@index([referenceDate])` não contêm `barbershopId`, e a
  listagem é sempre por salão — eles não servem como prefixo. O filtro
  `payment` (`paidAt IS NOT NULL` / `IS NULL`) e o `overdue`
  (`dueDate < agora`) perdem o apoio do índice.
- `dueDate` **não tem índice nenhum** na tabela: nem sozinho nem composto.
- Não há índice com `amount` nem com `createdAt` junto do salão, então
  `sort=amount` e `sort=createdAt` ordenam o conjunto filtrado em memória.
- `categoryId` e `type` existem como índice de coluna única: servem à
  igualdade, mas o Postgres ainda filtra o salão depois (leitura extra). Como
  são filtros de igualdade (não de faixa nem de ordenação), o benefício do
  composto é menor — fica registrado, não é prioridade.

Proposta (somente proposta, nada aplicado — ver seção 4):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_barbershopId_paidAt_idx"
  ON "expenses" ("barbershopId", "paidAt");       -- A8
CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_barbershopId_dueDate_idx"
  ON "expenses" ("barbershopId", "dueDate");      -- A9
CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_barbershopId_amount_idx"
  ON "expenses" ("barbershopId", "amount");       -- A10
CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_barbershopId_createdAt_idx"
  ON "expenses" ("barbershopId", "createdAt");    -- A11
```

E, no `schema.prisma`, para não gerar drift (ver o passo 6 da seção 4):

```prisma
model Expense {
  // ...
  @@index([barbershopId, paidAt])
  @@index([barbershopId, dueDate])
  @@index([barbershopId, amount])
  @@index([barbershopId, createdAt])
}
```

### 2.4 Análise dos índices de `CommissionEntry` (listagem da Fase 2)

Modelo: `CommissionEntry` → `@@map("commission_entries")` (`prisma/schema.prisma:989`).
`createdAt` é `DateTime @default(now())` (timestamp, **não** `@db.Date`), então o
filtro `from/to` usa `civilDayBounds` com o fuso do salão (`America/Sao_Paulo`).
O período filtra o **`createdAt` do lançamento** da comissão — não a data do
serviço nem a do agendamento — e isso está documentado no próprio schema
(comentário em `CommissionEntry.createdAt`).

O filtro `origin` (`QUEUE`/`APPOINTMENT`) **não é novo**: ele já existia no
schema de query (`z.enum(["QUEUE", "APPOINTMENT"]).optional()`) desde o commit
`352b499 feat(commissions): expose origin (queue/appointment) with optional
filter` — a listagem com filtros e ordenação manteve o contrato.

```prisma
model CommissionEntry {
  barbershopId   String
  professionalId String
  serviceId      String?
  amount         Decimal
  createdAt      DateTime @default(now())
  // ...
  @@index([barbershopId, createdAt])
  @@index([professionalId, createdAt])
  @@unique([queueItemId, professionalId])
  @@unique([appointmentId, professionalId])
  @@map("commission_entries")
}
```

| Consulta da listagem | Índice que a cobre | Situação |
|---|---|---|
| `(barbershopId, professionalId, createdAt)` — período + profissional + ordenação padrão | `@@index([barbershopId, createdAt])` (sem o profissional) | **parcial** (A12) |
| `(barbershopId, serviceId)` — filtro `serviceId` | nenhuma | **falta** (A13) |
| `(barbershopId, amount)` — `sort=valor` | nenhuma | **falta** (A14) |

Por que A12–A14 faltam:

- `@@index([barbershopId, createdAt])` cobre o período do salão, mas o
  `professionalId` não entra no índice: o Postgres lê o intervalo de datas e
  filtra o profissional linha a linha. O índice de 3 colunas
  `(barbershopId, professionalId, createdAt)` atende as duas igualdades **e** a
  faixa/ordenação — é a consulta da tela de comissões (profissional + período),
  por isso é o **prioritário**.
- `serviceId` **não tem índice nenhum** (nem sozinho nem com o salão). É filtro
  de igualdade simples, com volume baixo por salão: benefício real, mas menor
  que A12 — prioridade média.
- Não há `amount` junto do salão: `sort=valor` ordena o conjunto filtrado em
  memória. Menos urgente ainda (paginação pequena e ordenação barata).
- `@@index([professionalId, createdAt])` existe, mas **sem** `barbershopId`,
  então não serve à listagem multi-tenant (mesma conclusão das tabelas da
  seção 2.3).

Proposta (somente proposta, nada aplicado — ver seção 4):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "commission_entries_barbershopId_professionalId_createdAt_idx"
  ON "commission_entries" ("barbershopId", "professionalId", "createdAt");  -- A12
CREATE INDEX CONCURRENTLY IF NOT EXISTS "commission_entries_barbershopId_serviceId_idx"
  ON "commission_entries" ("barbershopId", "serviceId");                    -- A13
CREATE INDEX CONCURRENTLY IF NOT EXISTS "commission_entries_barbershopId_amount_idx"
  ON "commission_entries" ("barbershopId", "amount");                       -- A14
```

E, no `schema.prisma`, para não gerar drift (ver o passo 6 da seção 4):

```prisma
model CommissionEntry {
  // ...
  @@index([barbershopId, professionalId, createdAt])
  @@index([barbershopId, serviceId])
  @@index([barbershopId, amount])
}
```

### 2.5 Análise dos índices de `users` (listagem da equipe do dono)

Modelo: `User` → `@@map("users")` (`prisma/schema.prisma:12`). A listagem da
equipe (`GET /api/users`) é **sempre** por salão: `barbershopId` vem do contexto
(sessão do OWNER ou `?barbershopId=` do MASTER_ADMIN) e nunca da query.

Filtros da listagem: `search` (nome **ou** e-mail, `ILIKE`), `role` (papel),
`active` (situação) e `sort` (`nome`, `email`, `cargo`, `criado`). Membro
removido (`deletedAt` preenchido) **nunca** aparece.

| Consulta da listagem | Índice que a cobre | Situação |
|---|---|---|
| `(barbershopId, name)` — filtro por salão + `sort=nome` | nenhuma | **falta** (A15) |
| `(barbershopId, createdAt)` — ordenação padrão (`createdAt asc`) | nenhuma | **falta** (A16) |
| `(barbershopId, role)` — filtro por papel | nenhuma | **falta** (baixa prioridade: igualdade simples, volume baixo por salão) |
| `(barbershopId, active)` — filtro de situação | nenhuma | **falta** (baixa prioridade) |
| `name`/`email` — busca textual (`ILIKE '%termo%'`) | nenhum (GIN de `pg_trgm`) | **falta** (C3/C4) |

**Volume observado (consulta somente leitura, 2026-11-05, agregada — sem
nomes):** maior quantidade de usuários ativos (`deletedAt` nulo) em um salão =
**1**. Está bem abaixo do limiar de 70 que dispara reavaliação — o mesmo
limiar aplicado a serviços (seção 2.6, máximo de 5 por salão).

> **Origem do número:** medido no **banco local de DEV** (`agendai`,
> `localhost:5442`) — e o mesmo valor no banco de testes (`agendai_db`,
> `localhost:5442`). São dados locais, não de produção: **a mesma consulta
> precisa rodar em produção antes de dispensar a reavaliação** (ou de aplicar
> qualquer índice). Consulta usada:
>
> ```sql
> select max(cnt) from (
>   select "barbershopId", count(*) cnt
>   from users where "deletedAt" is null
>   group by "barbershopId"
> ) t;
> ```

Por que A15–A16 faltam:

- A tabela **não tem nenhum índice com `barbershopId`**: os índices que existem
  são de `email`, `cpf`, `deletedAt` e `googleSub` — nenhum deles serve como
  prefixo para a listagem, que é multi-tenant. O Postgres filtra a tabela
  inteira a cada consulta da equipe.
- `@@index([deletedAt])` existe, mas sem o salão: ele não serve à listagem
  (mesma conclusão das tabelas das seções 2.2–2.4).
- A busca por nome/e-mail com `ILIKE '%termo%'` não usa btree (o `%` à frente
  impede o uso do índice) — precisa do GIN de `pg_trgm` (seção 3.3).

RLS: `users` **tem** RLS (`rowsecurity = true`, `forcerowsecurity = true`) e a
policy `tenant_isolation` — ao contrário de `commission_entries` (seção 8).

**Diferença de escopo em relação ao admin da plataforma:** a rota do dono é por
salão (`barbershopId` do contexto, `role` só `OWNER`/`EMPLOYEE`, membro
removido sempre fora). A rota do admin (`GET /api/admin/team`, seção 2.7) é de
escopo plataforma: sem salão, `role` aceita `MASTER_ADMIN`/`OWNER`/`EMPLOYEE`
e o membro removido aparece quando `status=inactive` é pedido.

**Auditoria:** o acesso do admin interno à **listagem** (`GET /api/admin/team`)
**não passa por `createAuditLog`** — a rota é só leitura e não grava registro
de auditoria. Quem grava é só a mutação, por exemplo
`src/modules/admin/useCases/team/DeactivateMemberUseCase.ts:45`
(`tx.auditLog.create({ data: { action: "DEACTIVATE_INTERNAL_ADMIN", ... } })`)
e `ReactivateMemberUseCase.ts:27`. Registrar leitura de dado sensível (e-mail
de toda a plataforma) fica como **pendência conhecida**, não implementada.

Proposta (somente proposta, nada aplicado — ver seção 4):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_barbershopId_name_idx"
  ON "users" ("barbershopId", "name");        -- A15
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_barbershopId_createdAt_idx"
  ON "users" ("barbershopId", "createdAt");   -- A16
```

E, no `schema.prisma`, para não gerar drift (ver o passo 6 da seção 4):

```prisma
model User {
  // ...
  @@index([barbershopId, name])
  @@index([barbershopId, createdAt])
}
```

### 2.6 Análise dos índices de `services` (listagem de serviços)

Modelo: `Service` → `@@map("services")` (`prisma/schema.prisma:897`). A listagem
(`GET /api/services`) é **sempre** por salão: `barbershopId` vem do contexto
(resolvido no controller a partir da sessão ou do `?barbershopId=` da rota
pública) e nunca é um filtro da query.

Filtros da listagem: `search` (nome do serviço, `ILIKE`), `categoryId`,
`active` (situação) e `sort` (`nome`, `preco`, `duracao`, `criado`). A visão
**pública** (página de agendamento, sem token) filtra também
`publicBookable = true`; a visão **staff** (token do próprio salão) vê o
catálogo completo, incluindo serviços internos (audiência, diligência,
despacho).

| Consulta da listagem | Índice que a cobre | Situação |
|---|---|---|
| `(barbershopId, publicBookable, name)` — catálogo público | nenhuma | **falta** (A18 — **recomendado**) |
| `name` — busca textual (`ILIKE '%termo%'`) | nenhum (GIN de `pg_trgm`) | **falta** (C6 — **recomendado**) |
| `(barbershopId, name)` — filtro por salão + ordenação padrão (`name asc`) | nenhuma | **falta** (A17 — opcional) |
| `(barbershopId, categoryId)` — filtro por categoria | nenhuma | **falta** (A19 — opcional) |
| `(barbershopId, price)` — `sort=preco` | nenhuma | **falta** (A20 — opcional) |
| `(barbershopId, avgTimeMinutes)` — `sort=duracao` | nenhuma | **falta** (A21 — opcional) |
| `(barbershopId, createdAt)` — `sort=criado` | nenhuma | **falta** (A22 — opcional) |
| `(barbershopId, active)` — filtro de situação | nenhuma | **falta** (opcional: igualdade simples, volume baixo por salão) |

**Recomendados: só A18 e C6.** A18 cobre o caminho quente (catálogo público,
que é a rota mais consultada: a página de agendamento) e o C6 cobre a busca por
nome. Os demais (A17, A19–A22) ficam **opcionais** — são otimizações para
filtros e ordenações menos frequentes, com o volume atual por salão logo abaixo.

**Volume observado (consulta somente leitura, 2026-11-05, agregada — sem
nomes):** maior quantidade de serviços em um salão = **5**; maior quantidade de
usuários ativos (`deletedAt` nulo) em um salão = **1**. Os dois estão bem
abaixo do limiar de 70 que dispara reavaliação — por isso a lista de índices
recomendados é curta.

> **Origem do número:** medido no **banco local de DEV** (`agendai`,
> `localhost:5442`) — e o mesmo valor no banco de testes (`agendai_db`,
> `localhost:5442`). São dados locais, não de produção: **a mesma consulta
> precisa rodar em produção antes de dispensar a reavaliação**. Consultas
> usadas:
>
> ```sql
> select max(cnt) from (
>   select "barbershopId", count(*) cnt from services group by "barbershopId"
> ) t;
>
> select max(cnt) from (
>   select "barbershopId", count(*) cnt
>   from users where "deletedAt" is null
>   group by "barbershopId"
> ) t;
> ```

Por que A17–A22 faltam:

- A tabela tem **um único índice** (`services_pkey`, em `id`): nenhum índice
  ajuda o filtro por salão, que é obrigatório em toda consulta da listagem.
  O Postgres faz varredura sequencial da tabela inteira a cada chamada.
- O volume por salão é baixo (máximo de 5 serviços), então A18 + C6 bastam
  para o dia a dia; A17 e A19–A22 são opcionais.
- A busca por nome com `ILIKE '%termo%'` não usa btree (o `%` à frente impede o
  uso do índice) — precisa do GIN de `pg_trgm` (seção 3.3).

**Comportamento preservado:** serviço **inativo** continua aparecendo na
listagem quando o filtro `active` não é informado — desativar é a forma de
"remover" um serviço, e a listagem nunca escondeu serviço desativado. Com o
filtro `active=true`/`active=false`, a listagem passa a separar os dois
grupos.

Isso **não** abre brecha de reserva: criar agendamento (público **ou** staff)
rejeita serviço desativado — `assertAppointmentBookable` procura o serviço com
`active: true` e devolve 400 ("Serviço inválido para este estabelecimento") em
`src/modules/appointments/utils/assertAppointmentBookable.ts:61-71`; o
`JoinQueueUseCase` faz a mesma checagem
(`src/modules/queue/useCases/joinQueue/JoinQueueUseCase.ts:48-56`). Listar o
serviço inativo e recusar a reserva são comportamentos complementares:
desativar bloqueia a reserva sem apagar o histórico do serviço.

**Onde a página pública de agendamento busca os serviços** (`rg -n`, só
leitura):

| passo | arquivo:linha |
|---|---|
| rota da página pública (`/queue/:id`, aba "Agenda") | `frontend/src/app/App.tsx:90-93` |
| página que consome os serviços | `frontend/src/pages/PublicHome.tsx:32-42` e `227-250` |
| seletor que desenha os serviços | `frontend/src/features/appointments/AppointmentScheduler.tsx:274-308` |
| contexto que carrega os dados | `frontend/src/contexts/BarbershopContext.tsx:105-107` e `150` |
| wrapper da API | `frontend/src/infra/barbershopApi.ts:214-225` |
| rota do backend | `backend/src/shared/infra/http/routes/services.routes.ts:22` |
| visão pública (where) | `backend/src/modules/services/repositories/serviceListWhere.ts:20-29` |

O wrapper chama `GET /api/services?barbershopId=<id>` **sem token** (visitante
anônimo) e **sem `active`**: nem o backend filtra `active` na visão pública
(where = `{ barbershopId, AND: [{ publicBookable: true }] }`), nem o front
filtra (`PublicHome.tsx:59-64` calcula um `publicServices` por
`publicBookable`, mas **não o aplica** ao agendador — `PublicHome.tsx:228-230`
passa `services`). Resultado: serviço inativo pode aparecer e ser selecionável
na agenda pública, e só falha na hora de buscar o horário/confirmar.

**Proposta (não implementada):** na visão pública do `buildServiceListWhere`,
empilhar `{ active: true }` junto de `{ publicBookable: true }` — assim a agenda
pública só lista serviços ativos, sem mexer na visão staff (que continua
listando inativos para o dono, como hoje).

RLS: `services` **não tem** RLS (`rowsecurity = false`) — mesma situação de
`commission_entries` (seção 8): o isolamento hoje vem do `where` construído pela
aplicação (`buildServiceListWhere`), não do banco.

Proposta (somente proposta, nada aplicado — ver seção 4):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "services_barbershopId_name_idx"
  ON "services" ("barbershopId", "name");                      -- A17
CREATE INDEX CONCURRENTLY IF NOT EXISTS "services_barbershopId_publicBookable_name_idx"
  ON "services" ("barbershopId", "publicBookable", "name");    -- A18
CREATE INDEX CONCURRENTLY IF NOT EXISTS "services_barbershopId_categoryId_idx"
  ON "services" ("barbershopId", "categoryId");                -- A19
CREATE INDEX CONCURRENTLY IF NOT EXISTS "services_barbershopId_price_idx"
  ON "services" ("barbershopId", "price");                     -- A20
CREATE INDEX CONCURRENTLY IF NOT EXISTS "services_barbershopId_avgTimeMinutes_idx"
  ON "services" ("barbershopId", "avgTimeMinutes");            -- A21
CREATE INDEX CONCURRENTLY IF NOT EXISTS "services_barbershopId_createdAt_idx"
  ON "services" ("barbershopId", "createdAt");                 -- A22
```

E, no `schema.prisma`, para não gerar drift (ver o passo 6 da seção 4):

```prisma
model Service {
  // ...
  @@index([barbershopId, name])
  @@index([barbershopId, publicBookable, name])
  @@index([barbershopId, categoryId])
  @@index([barbershopId, price])
  @@index([barbershopId, avgTimeMinutes])
  @@index([barbershopId, createdAt])
}
```

### 2.7 Análise dos índices de `users` — equipe interna do admin (`GET /api/admin/team`)

A rota do admin da plataforma (`GET /api/admin/team`) lista a **equipe interna**
(`role = MASTER_ADMIN`) e é **de escopo plataforma**: não há salão no filtro.
Sem `role`, o escopo é a equipe interna; com `role`, o escopo passa a ser o
papel pedido — é o que o admin enxerga além do dono (o dono da equipe do salão
só filtra `OWNER`/`EMPLOYEE`, ver seção 2.5).

Filtros: `search` (nome **ou** e-mail, `ILIKE`), `status` (`active` = ativo e
não removido; `inactive` = desativado **ou** removido), `active` e `sort`
(`nome`, `email`, `cargo`, `criado`). A paginação mantém o **default 25** da
rota (o chamador que não manda `page`/`limit` continua recebendo as 25
primeiras posições, como antes).

| Consulta da listagem | Índice que a cobre | Situação |
|---|---|---|
| `(role, createdAt)` — escopo da equipe interna + ordenação padrão (`createdAt desc`) | nenhuma | **falta** (A23 — opcional) |
| `(role, deletedAt)` — filtro de membro removido (`status=inactive`) | nenhuma | **falta** (A24 — opcional) |
| `(role, name)` / `(role, email)` — ordenação por nome/e-mail com filtro de papel | nenhuma | **falta** (opcional, mesma razão do volume) |
| `name`/`email` — busca textual (`ILIKE '%termo%'`) | nenhum (GIN de `pg_trgm`) | **falta** (C3/C4 — reaproveitados) |

**Volume observado (consulta somente leitura, 2026-11-05, agregada — sem
nomes):** 1 `MASTER_ADMIN`, 19 `OWNER` e 5 `EMPLOYEE` na plataforma inteira —
muito abaixo do limiar de 70 que dispara reavaliação. Por isso **nenhum índice
novo é recomendado** aqui: A23 e A24 ficam como opção, e a busca reaproveita
os GIN de `pg_trgm` já propostos em C3/C4.

> **Origem do número:** medido no **banco local de DEV** (`agendai`,
> `localhost:5442`) — e o mesmo valor no banco de testes (`agendai_db`,
> `localhost:5442`). São dados locais, não de produção: **a mesma consulta
> precisa rodar em produção antes de dispensar a reavaliação**. Consulta usada:
>
> ```sql
> select role, count(*) from users group by role;
> ```

RLS: `users` **tem** RLS (`rowsecurity = true`, `forcerowsecurity = true`) e a
policy `tenant_isolation` (seção 7) — mas, como o papel `agendai` é SUPERUSER
com BYPASSRLS, a RLS **não é efetiva no ambiente de desenvolvimento**: o
isolamento real vem do `where` construído pela aplicação.

Proposta (somente proposta, nada aplicado — ver seção 4):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_role_createdAt_idx"
  ON "users" ("role", "createdAt");   -- A23 (opcional)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_role_deletedAt_idx"
  ON "users" ("role", "deletedAt");   -- A24 (opcional)
```

E, no `schema.prisma`, para não gerar drift (ver o passo 6 da seção 4):

```prisma
model User {
  // ...
  @@index([role, createdAt])   // A23
  @@index([role, deletedAt])   // A24
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
| C3 | `users` | GIN (`name gin_trgm_ops`) | busca por nome do membro da equipe (`ILIKE '%termo%'`) |
| C4 | `users` | GIN (`email gin_trgm_ops`) | busca por e-mail do membro da equipe (`ILIKE '%termo%'`) |
| C6 | `services` | GIN (`name gin_trgm_ops`) | busca por nome do serviço (`ILIKE '%termo%'`) — **recomendado** |

`whatsapp` é `VarChar(20)` e `normalizedWhatsapp` é `VarChar(11)`. O índice C2
cobre a coluna `whatsapp` usada pela listagem de clientes. Para a coluna
`normalizedWhatsapp`, considerar C5 se a busca passar a usar essa coluna:

```sql
-- C5 (opcional): GIN em normalized_whatsapp
CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_normalizedWhatsapp_trgm_idx"
  ON "salon_clients" USING gin ("normalizedWhatsapp" gin_trgm_ops);
```

Os índices C3/C4 cobrem a busca da listagem da equipe (`GET /api/users`), que
procura por nome **ou** e-mail com `ILIKE '%termo%'` — btree não ajuda nesse
caso (o `%` à esquerda impede o uso do índice).

O índice C6 cobre a busca por nome da listagem de serviços
(`GET /api/services?search=`), que também usa `ILIKE '%termo%'`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "services_name_trgm_idx"
  ON "services" USING gin ("name" gin_trgm_ops);
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
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "fiados_barbershopId_status_createdAt_idx" ON "fiados" ("barbershopId", "status", "createdAt");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "fiados_barbershopId_dueDate_idx" ON "fiados" ("barbershopId", "dueDate");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "fiados_barbershopId_createdAt_idx" ON "fiados" ("barbershopId", "createdAt");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "appointments_barbershopId_date_time_idx" ON "appointments" ("barbershopId", "date", "time");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "appointments_barbershopId_status_date_idx" ON "appointments" ("barbershopId", "status", "date");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "appointments_barbershopId_serviceId_date_idx" ON "appointments" ("barbershopId", "serviceId", "date");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_barbershopId_paidAt_idx" ON "expenses" ("barbershopId", "paidAt");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_barbershopId_dueDate_idx" ON "expenses" ("barbershopId", "dueDate");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_barbershopId_amount_idx" ON "expenses" ("barbershopId", "amount");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "expenses_barbershopId_createdAt_idx" ON "expenses" ("barbershopId", "createdAt");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "fiados_clientId_status_idx" ON "fiados" ("clientId", "status");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "client_packages_clientId_status_idx" ON "client_packages" ("clientId", "status");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "commission_entries_barbershopId_professionalId_createdAt_idx" ON "commission_entries" ("barbershopId", "professionalId", "createdAt");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "commission_entries_barbershopId_serviceId_idx" ON "commission_entries" ("barbershopId", "serviceId");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "commission_entries_barbershopId_amount_idx" ON "commission_entries" ("barbershopId", "amount");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_barbershopId_name_idx" ON "users" ("barbershopId", "name");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_barbershopId_createdAt_idx" ON "users" ("barbershopId", "createdAt");'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_name_trgm_idx" ON "salon_clients" USING gin ("name" gin_trgm_ops);'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "salon_clients_whatsapp_trgm_idx" ON "salon_clients" USING gin ("whatsapp" gin_trgm_ops);'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);'
   psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);'
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
     @@index([barbershopId, createdAt])           // A7
     @@index([clientId, status])                  // B1
   }

   model ClientPackage {
     // ...
     @@index([clientId, status])  // B2
   }

   model Appointment {
     // ...
     @@index([barbershopId, date, time])        // A6
     @@index([barbershopId, status, date])       // filtro de status
     @@index([barbershopId, serviceId, date])    // filtro por serviço
   }

   model Expense {
     // ...
     @@index([barbershopId, paidAt])      // A8
     @@index([barbershopId, dueDate])     // A9
     @@index([barbershopId, amount])      // A10
     @@index([barbershopId, createdAt])   // A11
   }

   model CommissionEntry {
     // ...
     @@index([barbershopId, professionalId, createdAt])  // A12
     @@index([barbershopId, serviceId])                  // A13
     @@index([barbershopId, amount])                     // A14
   }

    model User {
      // ...
      @@index([barbershopId, name])        // A15
      @@index([barbershopId, createdAt])   // A16
    }

    model Service {
      // ...
      @@index([barbershopId, name])                      // A17
      @@index([barbershopId, publicBookable, name])      // A18
      @@index([barbershopId, categoryId])                // A19
      @@index([barbershopId, price])                     // A20
      @@index([barbershopId, avgTimeMinutes])            // A21
      @@index([barbershopId, createdAt])                 // A22
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

      model User {
        // ...
        @@index([name(ops: raw("gin_trgm_ops"))], type: Gin)        // C3
        @@index([email(ops: raw("gin_trgm_ops"))], type: Gin)       // C4
      }

      model Service {
        // ...
        @@index([name(ops: raw("gin_trgm_ops"))], type: Gin)        // C6
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

**Consulta repetida em 2026-11-05** para as tabelas novas da Fase 2:
`commission_entries` → `rowsecurity = false`, `forcerowsecurity = false` (sem
RLS); `expenses` → `true`/`true` (com RLS). Ou seja, em `commission_entries` o
isolamento entre salões depende **só** do `where` com `barbershopId` construído
pelo repositório — validado no E2E de dois salões
(`tenantIsolation.integration.spec.ts`, bloco "comissões"). A lista completa das
tabelas com `barbershopId` e sem RLS e a proposta de policy estão na **seção 8**.

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

---

## 8. `commission_entries` sem RLS — achado e proposta

### 8.1 O achado

A tabela da listagem de comissões **não tem RLS**: `rowsecurity = false` e
`forcerowsecurity = false`. As tabelas da Fase 2 que já têm a policy
(`appointments`, `expenses`, `salon_clients`, `fiados`, `client_packages`) têm
`rowsecurity = true` **e** `forcerowsecurity = true`; `users` (a equipe do
dono) também tem as duas ligadas.

**Consulta somente leitura usada** (executada em 2026-11-05 contra
`agendai_db` — testes — e `agendai` — dev; os dois bancos devolveram as
**mesmas 52 tabelas**):

```sql
-- Somente leitura: lista as tabelas do schema public que têm a coluna
-- "barbershopId" e NÃO têm RLS habilitada.
SELECT c.relname::text AS tabela,
       c.relrowsecurity AS rowsecurity,
       c.relforcerowsecurity AS forcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = c.oid AND a.attname = 'barbershopId'
      AND a.attnum > 0 AND NOT a.attisdropped
  )
  AND c.relrowsecurity = false
ORDER BY c.relname;
```

**Resultado (52 linhas, idêntico em `agendai` e `agendai_db`):**

```text
              tabela              | rowsecurity | forcerowsecurity
----------------------------------+-------------+------------------
 activation_metrics               | f           | f
 ai_conversations                 | f           | f
 ai_intent_logs                   | f           | f
 appointment_policies             | f           | f
 appointment_product_reservations | f           | f
 appointment_series               | f           | f
 audit_logs                       | f           | f
 barbershop_onboardings           | f           | f
 barbershop_page_themes           | f           | f
 care_instruction_templates       | f           | f
 client_care_instructions         | f           | f
 client_reviews                   | f           | f
 client_salon_links               | f           | f
 commission_entries               | f           | f
 copilot_suggestions              | f           | f
 corporate_subscriptions          | f           | f
 custom_forms                     | f           | f
 daily_closeouts                  | f           | f
 daily_weather_logs               | f           | f
 dismissed_recommendations        | f           | f
 equipment                        | f           | f
 equipment_movements              | f           | f
 equipment_needs                  | f           | f
 financial_correction_logs        | f           | f
 fiscal_configs                   | f           | f
 form_responses                   | f           | f
 integrations                     | f           | f
 nfe_records                      | f           | f
 nps_responses                    | f           | f
 nps_surveys                      | f           | f
 owner_invites                    | f           | f
 post_media                       | f           | f
 pricing_rules                    | f           | f
 profit_entries                   | f           | f
 profit_settings                  | f           | f
 purchase_orders                  | f           | f
 quality_audits                   | f           | f
 quality_protocols                | f           | f
 review_invitations               | f           | f
 salon_reputation                 | f           | f
 service_combos                   | f           | f
 showcase_entries                 | f           | f
 showcase_events                  | f           | f
 staff_schedules                  | f           | f
 staff_services                   | f           | f
 staff_time_off                   | f           | f
 tasks                            | f           | f
 tickets                          | f           | f
 user_sessions                    | f           | f
 visit_tabs                       | f           | f
 visits                           | f           | f
 vouchers                         | f           | f
(52 rows)
```

### 8.2 Proposta — policy `tenant_isolation` para `commission_entries` (NÃO EXECUTAR)

Proposta, para discussão — **nada foi executado**: esta entrega é
documental, sem alterar banco nem roles.

```sql
-- PROPOSTA — não executada. Quando for aplicada, tem de ser uma migration nova
-- (prefixo > 20261112120000, ver AGENTS.md), nunca um ALTER avulso em produção.
ALTER TABLE "commission_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_entries" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_entries' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON "commission_entries"
      USING (
        COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
        OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
      );
  END IF;
END $$;
```

A expressão é **a mesma que já roda** em `appointments`, `expenses`,
`salon_clients`, `fiados` e `client_packages` (confere em `pg_policies.qual`):
o GUC `app.current_barbershop_id` é definido pelo cliente Prisma via `SET LOCAL`
(`src/libs/prismaExtensions.ts`); com o GUC vazio (MASTER_ADMIN, crons) a
policy deixa passar.

### 8.3 Avisos

1. **Nos bancos locais a policy não muda o resultado**: o papel `agendai` é
   superuser com `BYPASSRLS` (seção 7.1), então a RLS continua não filtrando
   nada aqui. O ganho imediato é **documental e de preparação**: a tabela passa
   a ter a mesma política das outras e fica pronta para o papel sem privilégios
   (seção 7.2).
2. **A aplicação não pode depender da RLS**: o isolamento efetivo continua
   sendo o `where` com o `barbershopId` do contexto — é o que o E2E de dois
   salões (`src/tests/integration/tenantIsolation.integration.spec.ts`, bloco
   "comissões") valida.
3. **Nenhum papel é criado ou alterado** por esta proposta: só liga a RLS e
   cria a policy numa tabela que **já tem** a coluna `barbershopId`.
4. **As outras 51 tabelas da lista da seção 8.1** seguem com a mesma dívida —
   estão fora do escopo desta entrega; cada uma precisa do seu próprio
   `ALTER TABLE ... ENABLE/FORCE` + policy, em migration própria.
5. Aplicar em produção exige janela: `ALTER TABLE ... ENABLE ROW LEVEL
   SECURITY` pode falhar com queries em voo se a tabela estiver grande.
