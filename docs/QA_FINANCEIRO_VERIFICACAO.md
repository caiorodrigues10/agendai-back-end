# Verificação financeira — consulta de divergência caixa × fila

> **SOMENTE LEITURA.** Nenhuma escrita, nenhum `DELETE`/`UPDATE`, nenhuma
> transação. Produção: **não executar** sem revisão; a execução feita nesta
> verificação foi **apenas no banco local de dev** (`agendai` local).

## 1. Objetivo

Detectar atendimentos em `queue` com status `COMPLETED` e `finalPrice > 0`
que **não** geraram lançamento de caixa (`cash_movements` com
`sourceType = 'QUEUE_ITEM'`), com ou sem `commission_entries`.

Serve para rastrear o efeito do bug de atomicidade
(`QueueRepository.completeWithCommissions` usava `prisma.$transaction` no
cliente com extensão RLS, que reroteia cada operação para outra conexão —
cada escrita cometia separadamente; falha em `cash_movements` deixava a fila
`COMPLETED` e a comissão gravadas).

## 2. Consulta principal (divergência)

```sql
-- SOMENTE LEITURA
SELECT q.id,
       q."customerName",
       q."finalPrice",
       q."completedAt",
       b.name AS barbershop,
       -- comissões gravadas para este item (0 = também não houve comissão)
       (SELECT count(*)::int
          FROM commission_entries ce
         WHERE ce."queueItemId" = q.id) AS comissoes,
       -- sempre 0 por definição da consulta abaixo
       (SELECT count(*)::int
          FROM cash_movements cm
         WHERE cm."sourceType" = 'QUEUE_ITEM'
           AND cm."sourceId" = q.id::text) AS lancamentos_caixa
  FROM queue q
  JOIN barbershops b ON b.id = q."barbershopId"
 WHERE q.status = 'COMPLETED'
   AND q."finalPrice" > 0
   AND NOT EXISTS (
         SELECT 1
           FROM cash_movements cm
          WHERE cm."sourceType" = 'QUEUE_ITEM'
            AND cm."sourceId" = q.id::text
       )
 ORDER BY q."completedAt";
```

Convenções relevantes:

- `cash_movements.sourceId` guarda o id da fila **como texto**
  (`q.id::text = cm."sourceId"`).
- `cash_movements.sourceType = 'QUEUE_ITEM'` é o marcador do lançamento de
  caixa de um atendimento.
- `comissoes` distingue os dois casos: **> 0** = comissão gravada sem caixa
  (vítima do bug de atomicidade); **0** = nem comissão existe (dado de seed
  ou fluxo que nunca passou pelo ledger).

## 3. Contagem rápida

```sql
-- SOMENTE LEITURA
SELECT count(*) AS divergentes
  FROM queue q
 WHERE q.status = 'COMPLETED'
   AND q."finalPrice" > 0
   AND NOT EXISTS (
         SELECT 1
           FROM cash_movements cm
          WHERE cm."sourceType" = 'QUEUE_ITEM'
            AND cm."sourceId" = q.id::text
       );
```

## 4. Resultado local (2026-10-10, banco local)

```
 id                                   | customerName | finalPrice | completedAt          | barbershop        | comissoes
 30d0e6e6-a721-40f1-af6e-0dabb841939d | SeedPhase2 A1 |       999 | 2026-09-22 22:19:36  | salao do garganta | 0
 89784c58-5939-429d-9930-73d74d2b3408 | SeedPhase2 A2 |       999 | 2026-09-23 22:19:36  | salao do garganta | 0
 total: 2
```

Leitura: as 2 divergências restantes são **linhas de seed** (`SeedPhase2`,
sem caixa **e** sem comissão) — não são vítimas do bug. As 3 vítimas
observadas em 2026-10-09 pertenciam à fixture de teste `[QA]` e foram
removidas junto com a limpeza daquele round. **Nenhuma correção foi feita nas
linhas `SeedPhase2` (fora de escopo).**
