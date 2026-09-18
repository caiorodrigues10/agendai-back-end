# Status da auditoria 15–16/09/2026

Matriz para **não** repetir a varredura de 11 agentes. Fonte: relatórios A1–A11 + código atual.

Legenda: **OPEN** ainda bloqueia; **FIXED** conferido no código desta entrega; **PARTIAL** mitigado mas incompleto; **WONTFIX** decisão explícita.

## P0 / dinheiro e takeover

| ID | Tema | Status | Notas |
|---|---|---|---|
| A7-001 | PAN/CVV no Fastify (Asaas) | FIXED | Checkout hospedado (`invoiceUrl`). Schema rejeita `asaasCreditCard`. PIX embutido permanece. |
| A7-004 | Token vaulted plaintext | FIXED | `encrypt()` AES-256-GCM (commit `e443b60`). Cron pós-trial ainda usa token legado. |
| A10-002 | `GET /ws` sem JWT | FIXED | JWT + `barbershopId` do token. Frontend envia access token. |
| A9-002 | NFS-e falsa AUTHORIZED | FIXED | Emissão grava `PENDING` + `SIMULATED`. |
| A4-001/002 | Gift/voucher race | FIXED | `SELECT … FOR UPDATE` + `updateMany` condicional. Códigos via `randomInt`. |
| A4-003/004 | Wallet self-credit | FIXED | `POST /wallet/credit` retorna 403. UI staff removida. |
| — | `authenticateClient` O(n) bcrypt | FIXED | SHA-256 `tokenDigest` + índice; bcrypt só em hashes `$2` legados. |
| — | Integrations `getById` segredo | FIXED | Mesma máscara do `list`. Decripta só em `getDecryptedCredentials`. |
| — | Cron trial sem lock | FIXED | `withCronLock` (`trial-card-charges`). |
| — | `/ready` unfinished rows | FIXED | Compara pasta `prisma/migrations` vs `_prisma_migrations` (finished, sem rollback). |
| — | `forget-account` cookie `a.b.c` | FIXED | `jwt.verify` + `findUsableRefreshToken` (mesmo padrão do switch-account). |
| A11 | ConfirmDialog sem FocusLock | FIXED | `react-focus-lock`. |
| — | Showcase `:entryId=analytics` | FIXED | UUID inválido → 400. Rota certa: `showcase-analytics`. |
| — | Worker `RUN_MIGRATIONS` | FIXED | Default `false` se `PROCESS_ROLE != api`. |

## Contrato / WIP

| ID | Tema | Status | Notas |
|---|---|---|---|
| — | `contract:check` `fetch(url)` | FIXED | Parser ignora param de transporte; extrai `clientFetch` literal. Dívida `entries: []`. |
| — | Vitest hang / `.config` | FIXED | Globals + jest-dom types; `autoUpdate` do floating-ui mockado; Vitest `forks` e hangTimeout 45s. |
| — | Error handler Zod/UUID | FIXED | Registrado antes das rotas (WIP). |
| — | Portal roles EMPLOYEE | FIXED | Constantes no schema (WIP). |

## A12 pricing + catalog

| ID | Tema | Status | Notas |
|---|---|---|---|
| A12-001 | Pricing sem spec | OPEN | Módulo `pricing` existe; CI `docs:check` agora exige o nome em STRUCTURE. Specs ainda ausentes. |
| A12-002 | Catalog avançado | OPEN | Combos/variações em `catalog`; cobertura de teste incompleta. |

## A13 purchasing ↔ InventoryEngine

| ID | Tema | Status | Notas |
|---|---|---|---|
| A13-001 | Receive → estoque | PARTIAL | Receive existente; `reverseReceipt` agora com `FOR UPDATE`. |
| A13-002 | Inventory race | PARTIAL | Produto já tinha lock; recibo agora também. |

## A14 corporate

| ID | Tema | Status | Notas |
|---|---|---|---|
| A14-001 | Admin sem RLS | FIXED | `adminGuard` inclui `setRlsContext`. |

## Onda 3 (altos)

| ID | Tema | Status | Notas |
|---|---|---|---|
| — | Float → Decimal | PARTIAL | Voucher `value`/`minPurchase` migrados. `Service.price` e receipts ainda `Float`. |
| — | Metas REVENUE vs comissão | FIXED | Progresso usa `queueItem.finalPrice` COMPLETED, não comissão. |
| — | CSV/overview unbounded | PARTIAL | Export e CRM overview com `take` 2k–10k. |
| — | Caixa `amount > 0` | FIXED | Zod `.positive()`. |
| — | Hard-delete usuário | FIXED | Soft: `active=false` + `deletedAt`. |
| — | Delete salão tokens/WA/sub | FIXED | Revoga refresh tokens, cancela assinatura, zera instância Evolution. |
| — | EMPLOYEE time-off | FIXED | POST/GET time-off para o próprio `staffId`. |
| — | Contact Redis RL + `request.ip` | FIXED | 5/15min por IP. Store Redis já é global. |
| — | WhatsApp quota por loja | FIXED | Redis `wa:quota:{instance}:{day}` (default 200). |
| — | `POST /analytics/activation` auth | FIXED | `authenticate` + OWNER/MASTER + shop match. |
| — | Dismiss recomendações 404 | FIXED | Tabela `dismissed_recommendations`. |
| — | `postAiService` extra | FIXED | Sanitiza control chars e limita 500. |
| — | OTP portal RL | FIXED | 5 req / 8 verify por 10 min por IP. |
| — | Loyalty/deposits sem tx | FIXED | `$transaction` + FOR UPDATE no depósito. |

Smoke autenticado (6 etapas de `DELIVERY_CHECKS.md`) continua **OPEN em homologação** — este harness não afirma “sistema validado em produção”.
