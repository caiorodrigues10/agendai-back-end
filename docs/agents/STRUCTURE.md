# Estrutura — Backend (`agendai-back-end`)

```
agendai-back-end/
├── AGENTS.md
├── AI_GUIDE.md                 ← guia histórico (aponta para AGENTS.md canônico)
├── package.json
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── system-docs/                ← MANUAL.md, api.http
├── docs/                       ← runbooks, pentest, agents/
│   └── agents/                 ← inventários deste manual
├── scripts/
└── src/
    ├── modules/                ← domínios (auth, queue, payments, products, …)
    ├── shared/
    │   ├── container/          ← DI (tsyringe) + providers
    │   ├── segments/          ← config por segmento (gate, publicidade, paridade)
    │   ├── infra/http/         ← app, server, middlewares, routes
    │   ├── infra/cron/
    │   ├── infra/queue/        ← BullMQ
    │   ├── services/           ← Evolution, idempotency, …
    │   ├── constants/
    │   └── errors/AppError.ts
    ├── libs/prismaClient.ts
    ├── config/
    └── tests/                  ← setup, integration, pentest
```

## Módulos (`src/modules/`)

Há **59** pastas em disco. `docs:check` falha se alguma não estiver listada aqui.

`admin`, `analytics`, `appointments`, `auth`, `barbershops`, `cases`, `cash`, `catalog`, `clientPortal`, `clients`, `commissions`, `contact`, `copilot`, `corporate`, `crm`, `deposits`, `email`, `equipment`, `expenses`, `feed`, `fiado`, `financial`, `fiscal`, `forms`, `goals`, `integrations`, `loyalty`, `monitoring`, `notifications`, `nps`, `organizations`, `packages`, `payments`, `plans`, `posts`, `pricing`, `productReservations`, `products`, `profit`, `purchasing`, `quality`, `queue`, `recurringPackages`, `referrals`, `reputation`, `serviceCategories`, `services`, `shared`, `showcase`, `staff`, `subscriptions`, `support`, `users`, `visits`, `vouchers`, `waitlist`, `wallet`, `whatsappAi`, `whatsappOwnerBot`.

Módulos que escaparam a varredura A1–A11 e agora entram na matriz de STATUS: **pricing**, **catalog** (avançado), **purchasing** (receive → estoque), **corporate** (admin com `setRlsContext`).

## Rotas HTTP (`shared/infra/http/routes/`)

Registradas via `api.ts` / `index.ts`. Inclui: auth, users, services, barbershops, queue, appointments, admin, adminFinancial, payments, webhooks, plans, fiado, expenses, barbershopFinancial, categories, feed, posts, notifications, contact, referrals, clients, packages, products, commissions, crm, ws, support (módulo próprio, `modules/support/support.routes`), productReservations (módulo próprio, vitrine pública + painel de reservas) e cases (módulo próprio, `modules/cases/routes/cases.routes` — gestão de processos do escritório, feature `caseManagement`) e caseBacklog (`modules/cases/routes/caseBacklog.routes` — contratos/assinaturas, timesheet, êxito, intimações, NFS-e, alertas e transferências).

Prefixo da API: **`/api`** (exceto health/métricas conforme app).

## Middlewares

`authenticate`, `authenticateOptional`, `authorize`, `checkSubscription`, `checkDashboardAccess`, `checkProductsInventoryAccess`, `setRlsContext`, `subscriptionAccessCache`, `verifyRecaptcha`, `correlationId`, `advertisingGuard` (403 em feature promocional para segmento com `advertisingRestricted`), `segmentModuleGuard` (403 em módulo oculto do segmento) e `segmentFeatureGuard` (403 quando o segmento não declara a feature exigida).

## Providers / integrações (arquivos)

| Integração | Implementação | Env (nomes) |
|---|---|---|
| Mercado Pago | `payments/services/MercadoPagoService.ts` | `MERCADOPAGO_*` |
| AbacatePay | `payments/services/AbacatePayService.ts` | `ABACATEPAY_*` |
| Asaas | `payments/services/AsaasService.ts` | `ASAAS_*` |
| Evolution WhatsApp | `shared/services/evolutionApiService.ts` (+ `whatsappNotificationService` shim) | `EVOLUTION_*` (`ZAPI_*` no `.env.example` é vestígio; sem uso no código) |
| Resend | `ResendEmailProvider` | `RESEND_*`, `EMAIL_*` |
| GCS | `GcsStorageProvider` | `GCS_*` |
| Redis / BullMQ | filas + cache assinatura | `REDIS_URL` |
| Sentry / OTEL | opcional | `SENTRY_DSN`, `OTEL_*` |
| Google OAuth | auth Google | `GOOGLE_CLIENT_*` |

Código existente ≠ habilitado em todo ambiente ≠ validado em produção.
