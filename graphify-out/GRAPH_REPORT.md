# Graph Report - agendai-back-end  (2026-08-25)

## Corpus Check
- 357 files · ~112,097 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2416 nodes · 5522 edges · 176 communities (121 shown, 55 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 136 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e68c786e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api.ts
- IFiadoResponseDTO
- IServiceResponseDTO
- PostsController.ts
- IExpenseResponseDTO
- AbacatePayService
- index.ts
- compilerOptions
- IBarbershopRepository
- AppError
- 💈 AgendAI — Backend API
- IBarbershopResponseDTO
- normalizeCpf
- IStorageProvider
- appointments.spec.ts
- IPlanResponseDTO
- IAppointmentResponseDTO
- auth.routes.ts
- MercadoPagoService
- IUserResponseDTO
- RegisterUseCase.ts
- IPaymentDTO.ts
- IPaymentResponseDTO
- SubscribeUseCase.ts
- AgendAI Back‑end — Manual do Sistema
- blockedEntityService.ts
- AppointmentController.ts
- LoginUseCase.ts
- IQueueRepository
- BarbershopFinancialController.ts
- queue.spec.ts
- LogoController.ts
- emailWorker.ts
- IPaymentRepository
- paymentSchemas.ts
- monitor-routes.js
- scripts
- planEconomics.ts
- index.ts
- Referência Completa de Rotas
- appointmentUseCases.ts
- payments.spec.ts
- IQueueItemResponseDTO
- IQueueRepository.ts
- referralService.ts
- index.ts
- ContactController.ts
- IEmailProvider.ts
- devDependencies
- CreateBarbershopUseCase
- server.ts
- QueueRepository
- GcsStorageProvider
- 9. Como Criar um Novo Módulo
- Barbearias
- AppointmentRepository
- 12. Erros Comuns e Como Evitá-los
- seed.ts
- IAppointmentRepository
- GetQueueMetricsUseCase
- 🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI
- Categorias
- app.ts
- ListBarbershopsUseCase.ts
- ListQueueController.ts
- Google Cloud Storage — setup AgendAI
- 13. Regras de Negócio Críticas
- Fiado
- GetBarbershopUseCase.ts
- GetPaymentStatusUseCase.ts
- PlansController.ts
- enqueueWhatsApp
- 6. Sistema de Autenticação e Autorização
- 8. Banco de Dados e Prisma
- dependencies
- Passo a passo
- Despesas
- Pagamentos
- 3. Arquitetura e Padrões
- 7. Sistema de Assinaturas e Bloqueio de CPF
- Apêndice B — Endpoints por Role
- Agendamentos
- Fila (Queue)
- Serviços
- setup-gcs.sh
- VerifyEmailController.ts
- PlansController
- StaffUserController
- 11. Testes
- 14. Integrações Externas
- 5. Convenções de Código
- Admin — Entidades Bloqueadas
- Admin — Notificações
- Admin — Usuários
- seed-test.js
- postgres.ts
- package.json
- Admin — Assinaturas
- Admin — Barbearias
- Admin — Planos
- Assinaturas
- Auth
- Financeiro da Barbearia
- fastify.d.ts
- bcryptjs
- busboy
- dayjs
- disposable-email-domains
- @fastify/cors
- @fastify/helmet
- @fastify/multipart
- @fastify/rate-limit
- @fastify/swagger
- @fastify/swagger-ui
- @google-cloud/storage
- ioredis
- jsonwebtoken
- mercadopago
- node-cron
- pg
- @prisma/client
- reflect-metadata
- resend
- @resvg/resvg-js
- tsconfig-paths
- tsyringe
- zod
- tsup
- tsx
- @types/bcryptjs
- @types/node
- @types/node-cron
- @types/pg
- vite-tsconfig-paths
- vitest
- ensure-gcs-key.sh
- emailValidationService.spec.ts
- disposable-email-domains.d.ts
- UpdateQueueItemUseCase.ts
- GoogleLoginUseCase
- Pentest local — auth, sessão, pagamentos e webhooks (21 ago 2026)
- DeleteBarbershopUseCase
- sendWhatsAppMessage
- Pentest local — inputs, upload, XSS e exposição pública
- UpdateBarbershopUseCase
- userSchemas.ts
- Pentest local autorizado
- DeleteQueueItemUseCase
- GetMyReferralsUseCase.ts
- RefundPaymentUseCase
- cancelSubscription.spec.ts
- PENTEST_REPORT_TEMPLATE.md
- fastify
- @prisma/adapter-pg
- @testcontainers/postgresql
- @types/jsonwebtoken
- AppointmentRepository
- IQueueRepository
- issueAuthSession.ts
- sendWhatsAppMessage
- assertAppointmentBookable.ts
- VerifyEmailController.ts
- disposable-email-domains
- google-auth-library
- @opentelemetry/api
- @opentelemetry/exporter-prometheus
- @opentelemetry/resources
- @opentelemetry/sdk-node
- @opentelemetry/semantic-conventions
- pino
- @sentry/node

## God Nodes (most connected - your core abstractions)
1. `AppError` - 92 edges
2. `prisma` - 72 edges
3. `authenticate()` - 47 edges
4. `IPaymentResponseDTO` - 41 edges
5. `IBarbershopRepository` - 40 edges
6. `authorize()` - 38 edges
7. `checkSubscription()` - 37 edges
8. `IPaymentRepository` - 34 edges
9. `IQueueItemResponseDTO` - 34 edges
10. `AsaasService` - 31 edges

## Surprising Connections (you probably didn't know these)
- `scheduleAppointmentReminders()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/cron/appointmentReminders.cron.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `notificationsRoutes()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/http/routes/notifications.routes.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `buildApp()` --indirect_call--> `apiRoutes()`  [INFERRED]
  src/shared/infra/http/app.ts → src/shared/infra/http/routes/api.ts
- `adminRoutes()` --indirect_call--> `authenticate()`  [INFERRED]
  src/shared/infra/http/routes/admin.routes.ts → src/shared/infra/http/middlewares/authenticate.ts
- `adminFinancialRoutes()` --indirect_call--> `authenticate()`  [INFERRED]
  src/shared/infra/http/routes/adminFinancial.routes.ts → src/shared/infra/http/middlewares/authenticate.ts

## Import Cycles
- None detected.

## Communities (176 total, 55 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.20
Nodes (20): authorize(), checkDashboardAccess(), checkSubscription(), adminRoutes(), adminFinancialRoutes(), financial, apiRoutes(), appointmentsRoutes() (+12 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.06
Nodes (34): FiadoController, FiadoStatus, ICreateFiadoDTO, ICreateFiadoPaymentDTO, IFiadoListQuery, IFiadoPaymentResponseDTO, IFiadoResponseDTO, IFiadoSummary (+26 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.06
Nodes (28): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, createServiceSchema, updateServiceSchema (+20 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.08
Nodes (35): assertSameBarbershop(), buildPostImage(), defaultCtaText(), ENUM_TO_INPUT, loadPostContext(), PostRow, PostsController, postSelect (+27 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.29
Nodes (5): refundBodySchema, RefundPaymentController, RefundPaymentUseCase, inject, injectable

### Community 6 - "index.ts"
Cohesion: 0.06
Nodes (30): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository (+22 more)

### Community 7 - "compilerOptions"
Cohesion: 0.05
Nodes (37): ./*, config/*, dist, dtos/*, ES2022, libs/*, modules/*, node_modules (+29 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.17
Nodes (6): IBarbershopRepository, GetScheduleController, GetScheduleUseCase, inject, injectable, inject

### Community 9 - "AppError"
Cohesion: 0.07
Nodes (24): adapter, pool, prisma, issueAuthSession(), mapRole(), parseDuration(), UserLike, GoogleLoginUseCase (+16 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.07
Nodes (29): 💈 AgendAI — Backend API, Autenticação, Com Docker (recomendado), Como obter o token JWT para o monitor, Como Rodar, Configuração do Ambiente, Documentação Swagger, Estrutura do Projeto (+21 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.16
Nodes (3): IBarbershopResponseDTO, BarbershopRepository, MockBarbershopRepository

### Community 12 - "normalizeCpf"
Cohesion: 0.24
Nodes (3): assertOwner(), assertShopAccess(), UpdateServicePackageUseCase

### Community 13 - "IStorageProvider"
Cohesion: 0.07
Nodes (24): ConfirmLogoUseCase, IConfirmLogoDTO, inject, injectable, DeleteLogoUseCase, inject, injectable, ALLOWED_MIME_TYPES (+16 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.10
Nodes (15): AppointmentController, ADMIN, otherOwner, CancelAppointmentUseCase, CreateAppointmentUseCase, CreatePublicAppointmentUseCase, GetAppointmentUseCase, GetAvailabilityUseCase (+7 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.06
Nodes (40): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+32 more)

### Community 16 - "IAppointmentResponseDTO"
Cohesion: 0.20
Nodes (10): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentWithRelations, include (+2 more)

### Community 17 - "auth.routes.ts"
Cohesion: 0.09
Nodes (25): googleLoginSchema, loginSchema, phoneBR, refreshSchema, registerSchema, GoogleLoginController, validateGoogleLogin, LoginController (+17 more)

### Community 18 - "MercadoPagoService"
Cohesion: 0.08
Nodes (16): AdminAuditLogController, AdminBarbershopController, AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period, AdminNotificationController (+8 more)

### Community 19 - "IUserResponseDTO"
Cohesion: 0.14
Nodes (12): ICreateUserDTO, RoleLiteral, IUserResponseDTO, RoleLiteral, MockUserRepository, publicSelect, UserRepository, IUserRepository (+4 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.21
Nodes (12): BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField, listClientPackagesQuerySchema, listServicePackagesQuerySchema, SellClientPackageInput (+4 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.13
Nodes (17): IBillingAddressDTO, ICardPayerDTO, IMercadoPagoWebhookDTO, IPaymentResponseDTO, IPixQrCodeDTO, PaymentMethod, PaymentProvider, PaymentStatus (+9 more)

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.19
Nodes (12): IInvoiceResponseDTO, ISubscribeDTO, ISubscriptionResponseDTO, SubscriptionStatus, makeFullSubscription(), makeSubscription(), NOW, prismaMock (+4 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.09
Nodes (21): AgendAI Back‑end — Manual do Sistema, Autenticação e Autorização, Banco de Dados (Prisma), Com Docker, Como Adicionar um Novo Caso de Uso/Endpoint, Convenções, Definições, Dicas para IA (+13 more)

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.15
Nodes (13): BlockedEntityAdminController, BlockInput, blockSchema, UnblockInput, unblockSchema, BlockedEntityType, blockEntity(), BlockOptions (+5 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.19
Nodes (16): availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR, timeField, UpdateAppointmentInput (+8 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.08
Nodes (34): AsaasBillingType, AsaasCustomer, AsaasPayment, AsaasPixQrCode, AsaasRefund, logger, computeProratedAmount(), findApprovedPayment() (+26 more)

### Community 28 - "IQueueRepository"
Cohesion: 0.18
Nodes (5): inject, NotifyQueuePositionUpdatesUseCase, inject, injectable, inject

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.13
Nodes (12): BarbershopFinancialController, ExpenseRow, ExpenseWithCategory, FiadoRow, FiadoWithPayments, BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod (+4 more)

### Community 30 - "queue.spec.ts"
Cohesion: 0.14
Nodes (15): AuthConfig, mePreHandler(), authenticate(), extractBearerToken(), JwtPayload, authenticateOptional(), JwtPayload, authRoutes() (+7 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.16
Nodes (10): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+2 more)

### Community 32 - "emailWorker.ts"
Cohesion: 0.25
Nodes (16): apiUrl(), buildVerifyEmail(), escapeHtml(), emailLayout(), frontendUrl(), buildReferralAppliedEmail(), buildReferralConvertedEmail(), buildReferralRevokedEmail() (+8 more)

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.10
Nodes (16): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+8 more)

### Community 35 - "monitor-routes.js"
Cohesion: 0.17
Nodes (15): args, C, classify(), clearScreen(), http, https, pad(), render() (+7 more)

### Community 36 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, build, db:push, db:push:prod, db:studio, dev, dev:docker, prisma:generate (+16 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.14
Nodes (16): CancellationContextController, CancellationContextResult, CancellationContextUseCase, emptyContext(), SubscriptionEconomicsController, computePlanEconomics(), computePlatformEconomics(), inferBillingCycle() (+8 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.12
Nodes (16): Admin — Audit Logs, Admin — Dashboard, Admin — Financeiro, `GET /admin/audit-logs` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/dashboard`, `GET /admin/financial/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/overview` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/summary` 🔒 🛡️ `MASTER_ADMIN` (+8 more)

### Community 40 - "appointmentUseCases.ts"
Cohesion: 0.51
Nodes (3): ICreateBarbershopDTO, IUpdateBarbershopDTO, ScheduleItem

### Community 41 - "payments.spec.ts"
Cohesion: 0.07
Nodes (24): ICreateCardPaymentDTO, ICreatePixPaymentDTO, MercadoPagoService, MPPaymentResponse, injectable, ProratedRefundInput, CreateCardPaymentUseCase, inject (+16 more)

### Community 42 - "IQueueItemResponseDTO"
Cohesion: 0.13
Nodes (4): IQueueItemResponseDTO, MockQueueRepository, QueueRepository, QueueWaitEstimate

### Community 43 - "IQueueRepository.ts"
Cohesion: 0.29
Nodes (5): updateBarbershopSchema, UpdateBarbershopController, inject, injectable, UpdateBarbershopUseCase

### Community 44 - "referralService.ts"
Cohesion: 0.28
Nodes (12): ensureReferralCode(), generateCode(), getReferralDashboard(), logger, tierLabel(), getConversionsToNextTier(), getNextTier(), getReferralTier() (+4 more)

### Community 45 - "index.ts"
Cohesion: 0.20
Nodes (17): EmailJobData, emailQueue, emailQueueEvents, getEvents(), getQueue(), getRedisConnection(), redisConnection, enqueueWhatsApp() (+9 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.10
Nodes (20): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, TOPIC_LABEL (+12 more)

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.25
Nodes (8): EmailTemplateId, IEmailProvider, SendEmailInput, SendEmailResult, logger, ResendEmailProvider, injectable, MockEmailProvider

### Community 49 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, @testcontainers/postgresql, tsx, @types/bcryptjs, @types/busboy, @types/node, @types/node-cron, @types/pg (+9 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.32
Nodes (4): GetBarbershopController, GetBarbershopUseCase, inject, injectable

### Community 51 - "server.ts"
Cohesion: 0.11
Nodes (19): ChargeTrialEndedSubscriptionsUseCase, inject, injectable, CronLogger, TODO: este cron dispara em cada réplica do serviço. Hoje o backend roda em, scheduleAppointmentReminders(), cleanTable(), scheduleCleanOldLogs() (+11 more)

### Community 52 - "QueueRepository"
Cohesion: 0.14
Nodes (13): IJoinQueueDTO, QueueStatus, IUpdateQueueItemDTO, PrismaQueueStatus, toDTO(), toPrisma(), IQueueRepository, inject (+5 more)

### Community 54 - "9. Como Criar um Novo Módulo"
Cohesion: 0.18
Nodes (11): 9. Como Criar um Novo Módulo, Passo 10 — Schema Prisma, Passo 1 — DTOs, Passo 2 — Interface do Repositório, Passo 3 — Mock Repository (para testes), Passo 4 — Implementação Prisma, Passo 5 — Schemas Zod, Passo 6 — UseCases (+3 more)

### Community 55 - "Barbearias"
Cohesion: 0.18
Nodes (11): Barbearias, `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`, Logo — Fluxo via Signed URL (recomendado para produção), Logo — Upload Direto via Multipart (mais simples) (+3 more)

### Community 56 - "AppointmentRepository"
Cohesion: 0.10
Nodes (12): ClientPackageController, resolveBarbershopId(), ServicePackageController, BookClientPackageUseCase, CancelClientPackageUseCase, ConsumeClientPackageUseCase, CreateServicePackageUseCase, ListClientPackagesUseCase (+4 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.20
Nodes (10): 12. Erros Comuns e Como Evitá-los, ❌ Converter BigInt para Number, ❌ Esquecer de registrar o repositório no container, ❌ Esquecer `reflect-metadata` no setup de testes, ❌ Importar tipos Prisma do pacote diretamente, ❌ Instanciar Prisma fora de `prismaClient.ts`, ❌ Não registrar rota no `api.ts`, ❌ Passar string de token JWT diretamente em `expiresIn` (+2 more)

### Community 58 - "seed.ts"
Cohesion: 0.07
Nodes (17): adapter, defaultPlans, pool, prisma, LoginUseCase, inject, injectable, inject (+9 more)

### Community 59 - "IAppointmentRepository"
Cohesion: 0.27
Nodes (10): buildQueueUpdateMessage(), calendarDateParts(), createAppointmentAtomic(), formatSaoPauloTime(), mapCreatedAppointment(), ReminderResult, scheduledInstant(), debitClientPackageInTx() (+2 more)

### Community 60 - "GetQueueMetricsUseCase"
Cohesion: 0.24
Nodes (4): GetQueueMetricsController, GetQueueMetricsUseCase, inject, injectable

### Community 61 - "🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI"
Cohesion: 0.22
Nodes (9): 10. Como Criar um Novo Endpoint, 15. Checklist antes de Finalizar uma Tarefa, 1. Visão Geral do Projeto, 2. Stack e Versões, 4. Estrutura de Pastas, 🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI, Apêndice A — Mapa de Tokens de Injeção, Exemplo completo — `GET /reviews` (+1 more)

### Community 62 - "Categorias"
Cohesion: 0.22
Nodes (9): Categorias, `DELETE /expense-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /service-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `GET /expense-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /service-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /expense-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `PATCH /service-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `POST /expense-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋 (+1 more)

### Community 63 - "app.ts"
Cohesion: 0.19
Nodes (11): IBookPackageSlotDTO, ICreateServicePackageDTO, ISellClientPackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map() (+3 more)

### Community 64 - "ListBarbershopsUseCase.ts"
Cohesion: 0.28
Nodes (4): ListBarbershopsController, ListBarbershopsUseCase, inject, injectable

### Community 65 - "ListQueueController.ts"
Cohesion: 0.28
Nodes (5): ListQueueController, toPublicView(), ListQueueUseCase, inject, injectable

### Community 66 - "Google Cloud Storage — setup AgendAI"
Cohesion: 0.25
Nodes (6): Alternativa: `GCS_CREDENTIALS_JSON`, Google Cloud Storage — setup AgendAI, Produção (Cloud Run / GKE), Pré-requisitos, Rotação de chave, Scripts relacionados

### Community 67 - "13. Regras de Negócio Críticas"
Cohesion: 0.25
Nodes (8): 13.1 Fila (Queue), 13.2 Fiado, 13.3 Agendamentos, 13.4 Usuários, 13.5 Barbearias, 13.6 Pagamentos, 13.7 CPF no JWT, 13. Regras de Negócio Críticas

### Community 68 - "Fiado"
Cohesion: 0.25
Nodes (8): `DELETE /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, Fiado, `GET /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /fiado` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /fiado/summary` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /fiado/:id/payments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /fiado` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋

### Community 69 - "GetBarbershopUseCase.ts"
Cohesion: 0.13
Nodes (7): IPaymentRepository, ListPaymentsUseCase, inject, injectable, inject, inject, inject

### Community 70 - "GetPaymentStatusUseCase.ts"
Cohesion: 0.39
Nodes (4): setupSwagger(), buildApp(), registerRoutes(), createTestApp()

### Community 71 - "PlansController.ts"
Cohesion: 0.26
Nodes (10): blockOwnerCpfs(), buildSubscriptionRequiredError(), checkBarbershopAccess(), checkCnpjAccess(), SUBSCRIPTION_MESSAGES, SUBSCRIPTION_STATUS_CONFIG, assertCpfNotBlocked(), getAvailablePlans() (+2 more)

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.25
Nodes (5): ALLOWED_MIME_TYPES, IUploadLogoDirectDTO, inject, injectable, UploadLogoDirectUseCase

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.29
Nodes (7): 6.1 Middlewares disponíveis, 6.2 Combinação padrão de preHandler, 6.3 Roles e permissões, 6.4 Acesso ao usuário no request, 6.5 Autorização em UseCases, 6.6 Token JWT, 6. Sistema de Autenticação e Autorização

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.29
Nodes (7): 8.1 Instância do Prisma, 8.2 UUIDs, 8.3 Soft delete vs hard delete, 8.4 Enum mapping, 8.5 Migrations vs db push, 8.6 BigInt, 8. Banco de Dados e Prisma

### Community 76 - "Passo a passo"
Cohesion: 0.29
Nodes (7): 1. Projeto GCP, 2. Variáveis no `.env`, 3. Criar Service Account + chave JSON, 4. Bucket, CORS, IAM público e pastas, 5. Rodar a API, 6. Smoke test, Passo a passo

### Community 77 - "Despesas"
Cohesion: 0.29
Nodes (7): `DELETE /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, Despesas, `GET /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /expenses` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /expenses/summary` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /expenses` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋

### Community 78 - "Pagamentos"
Cohesion: 0.29
Nodes (7): `GET /payments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE`, `GET /payments` 🔒 🛡️ `MASTER_ADMIN, OWNER`, Pagamentos, `PATCH /payments/:id/cancel` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `POST /payments/card` 🔒, `POST /payments/pix` 🔒, `POST /payments/webhook`

### Community 79 - "3. Arquitetura e Padrões"
Cohesion: 0.33
Nodes (6): 3.1 Clean Architecture (simplificada), 3.2 Padrão por módulo, 3.3 Injeção de Dependências, 3.4 Tratamento de Erros, 3.5 Resposta HTTP padrão, 3. Arquitetura e Padrões

### Community 80 - "7. Sistema de Assinaturas e Bloqueio de CPF"
Cohesion: 0.33
Nodes (6): 7.1 Fluxo de acesso, 7.2 Status de Subscription, 7.3 Resposta 402 padronizada, 7.4 Bloqueio automático de CPF, 7.5 Serviço de bloqueio, 7. Sistema de Assinaturas e Bloqueio de CPF

### Community 81 - "Apêndice B — Endpoints por Role"
Cohesion: 0.33
Nodes (6): Apêndice B — Endpoints por Role, MASTER_ADMIN only, OWNER + EMPLOYEE + MASTER_ADMIN, OWNER + MASTER_ADMIN, OWNER only, Público (sem autenticação)

### Community 82 - "Agendamentos"
Cohesion: 0.33
Nodes (6): Agendamentos, `DELETE /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `GET /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /appointments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /appointments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋

### Community 83 - "Fila (Queue)"
Cohesion: 0.33
Nodes (6): `DELETE /queue/:id` 🔒 📋, Fila (Queue), `GET /queue` 🔒 📋, `GET /queue/metrics`, `PATCH /queue/:id` 🔒 📋, `POST /queue`

### Community 84 - "Serviços"
Cohesion: 0.33
Nodes (6): `DELETE /services/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `GET /services`, `GET /services/:id`, `POST /services` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `PUT /services/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, Serviços

### Community 85 - "setup-gcs.sh"
Cohesion: 0.60
Nodes (5): err(), info(), ok(), setup-gcs.sh script, warn()

### Community 89 - "11. Testes"
Cohesion: 0.40
Nodes (5): 11.1 Configuração, 11.2 Padrão de teste, 11.3 Executar testes, 11.4 O que deve ser testado, 11. Testes

### Community 90 - "14. Integrações Externas"
Cohesion: 0.40
Nodes (5): 14.0 E-mail (Resend) + Indicação, 14.1 Mercado Pago, 14.2 Google Cloud Storage, 14.3 Variáveis de Ambiente Obrigatórias em Produção, 14. Integrações Externas

### Community 91 - "5. Convenções de Código"
Cohesion: 0.40
Nodes (5): 5.1 Importações, 5.2 Nomenclatura, 5.3 Tipos, 5.4 Async/Await, 5. Convenções de Código

### Community 92 - "Admin — Entidades Bloqueadas"
Cohesion: 0.40
Nodes (5): Admin — Entidades Bloqueadas, `DELETE /admin/blocked-entities/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/blocked-entities/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/blocked-entities` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/blocked-entities` 🔒 🛡️ `MASTER_ADMIN`

### Community 93 - "Admin — Notificações"
Cohesion: 0.40
Nodes (5): Admin — Notificações, `GET /admin/notifications` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/notifications/unread-count` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/notifications/:id/read` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/notifications/read-all` 🔒 🛡️ `MASTER_ADMIN`

### Community 94 - "Admin — Usuários"
Cohesion: 0.40
Nodes (5): Admin — Usuários, `DELETE /admin/users/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/users` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/users/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/users` 🔒 🛡️ `MASTER_ADMIN`

### Community 95 - "seed-test.js"
Cohesion: 0.40
Nodes (3): prisma, { PrismaClient }, { randomUUID }

### Community 97 - "package.json"
Cohesion: 0.50
Nodes (3): main, name, version

### Community 98 - "Admin — Assinaturas"
Cohesion: 0.50
Nodes (4): Admin — Assinaturas, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions` 🔒 🛡️ `MASTER_ADMIN`

### Community 99 - "Admin — Barbearias"
Cohesion: 0.50
Nodes (4): Admin — Barbearias, `GET /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/barbershops/:id/status` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`

### Community 100 - "Admin — Planos"
Cohesion: 0.50
Nodes (4): Admin — Planos, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/plans` 🔒 🛡️ `MASTER_ADMIN`

### Community 101 - "Assinaturas"
Cohesion: 0.50
Nodes (4): Assinaturas, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `GET /subscriptions/me` 🔒, `POST /subscriptions` 🔒 🛡️ `MASTER_ADMIN, OWNER`

### Community 102 - "Auth"
Cohesion: 0.50
Nodes (4): Auth, `GET /auth/me` 🔒, `POST /auth/login`, `POST /auth/refresh`

### Community 103 - "Financeiro da Barbearia"
Cohesion: 0.50
Nodes (4): Financeiro da Barbearia, `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋

### Community 106 - "busboy"
Cohesion: 0.29
Nodes (4): abacateMock, asaasMock, mpMock, prismaMock

### Community 108 - "disposable-email-domains"
Cohesion: 0.22
Nodes (5): allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessWebhookController

### Community 109 - "@fastify/cors"
Cohesion: 0.18
Nodes (11): bcryptjs, bullmq, @fastify/swagger-ui, ioredis, @opentelemetry/instrumentation-fastify, dependencies, bcryptjs, bullmq (+3 more)

### Community 118 - "mercadopago"
Cohesion: 0.26
Nodes (6): DeleteAccountController, validateDeleteAccount(), ExportUserDataController, ExportUserDataUseCase, injectable, usersRoutes()

### Community 131 - "@types/node"
Cohesion: 0.10
Nodes (11): AbacateCheckout, AbacateCustomer, AbacatePayService, AbacateProduct, CreateCheckoutInput, EnsureProductInput, injectable, CancelPaymentController (+3 more)

### Community 133 - "@types/pg"
Cohesion: 0.14
Nodes (12): asaasCreditCardSchema, identificationSchema, SetupTrialCardInput, setupTrialCardSchema, SubscribeInput, subscribeSchema, SetupTrialCardController, SetupTrialCardUseCase (+4 more)

### Community 135 - "vitest"
Cohesion: 0.15
Nodes (10): allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody, timingSafeStringEqual(), allowDevModeWebhooks(), IAbacateWebhookPayload, ProcessAbacateWebhookUseCase, skipApiVerification() (+2 more)

### Community 141 - "UpdateQueueItemUseCase.ts"
Cohesion: 0.10
Nodes (21): prismaMock, DeleteQueueItemController, DeleteQueueItemUseCase, injectable, logger, NotifyQueuePositionResult, masterAdmin, spInstant() (+13 more)

### Community 143 - "Pentest local — auth, sessão, pagamentos e webhooks (21 ago 2026)"
Cohesion: 0.18
Nodes (10): Achados e correções aplicadas neste ciclo, Casos executáveis (inclusos no plano), Casos manuais → automatizados, Controles validados (sem achado novo), Inventário Graphify, Limitações, PENTEST-AUTH-001 — Authorization sem validação de scheme `Bearer` (corrigido), PENTEST-AUTH-002 — Refresh JWT sem `jti` podia colidir no mesmo segundo (corrigido) (+2 more)

### Community 144 - "DeleteBarbershopUseCase"
Cohesion: 0.24
Nodes (4): DeleteBarbershopController, DeleteBarbershopUseCase, inject, injectable

### Community 145 - "sendWhatsAppMessage"
Cohesion: 0.20
Nodes (7): PlansController, planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 146 - "Pentest local — inputs, upload, XSS e exposição pública"
Cohesion: 0.25
Nodes (7): Achados confirmados, Controles validados, Evidência de mapeamento, Limitações e próximas verificações, PENTEST-INPUT-001 — URLs de imagem do feed sem esquema permitido, PENTEST-INPUT-002 — conteúdo HTML do feed é armazenado sem sanitização de domínio, Pentest local — inputs, upload, XSS e exposição pública

### Community 147 - "UpdateBarbershopUseCase"
Cohesion: 0.15
Nodes (11): createBarbershopSchema, phoneBR, scheduleItemSchema, updateScheduleSchema, CreateBarbershopController, CreateBarbershopUseCase, inject, injectable (+3 more)

### Community 148 - "userSchemas.ts"
Cohesion: 0.11
Nodes (24): AdminUserController, IRegisterDTO, mapRole(), parseDuration(), RegisterUseCase, injectable, attachReferralOnRegister(), cpfSchema (+16 more)

### Community 149 - "Pentest local autorizado"
Cohesion: 0.29
Nodes (6): Achado estático (corrigido), Ambiente isolado, Casos executáveis incluídos, Casos manuais (agora automatizados em `src/tests/pentest/`), Inventário assistido por Graphify, Pentest local autorizado

### Community 150 - "DeleteQueueItemUseCase"
Cohesion: 0.20
Nodes (5): AdminFinancialController, EnrichedBarbershop, ExpenseRow, FiadoRow, FiadoSummaryRow

### Community 151 - "GetMyReferralsUseCase.ts"
Cohesion: 0.32
Nodes (4): ReferralsController, GetMyReferralsUseCase, injectable, referralsRoutes()

### Community 153 - "cancelSubscription.spec.ts"
Cohesion: 0.29
Nodes (4): issueProratedRefundMock, prismaMock, cancelReasonSchema, CancelSubscriptionController

### Community 160 - "AppointmentRepository"
Cohesion: 0.29
Nodes (3): AppointmentRepository, mapToDTO(), todayInSaoPaulo()

### Community 164 - "sendWhatsAppMessage"
Cohesion: 0.44
Nodes (6): isEvolutionConfigured(), isWhatsAppGatewayConfigured(), normalizeWhatsAppPhone(), sendWhatsAppMessage(), SendWhatsAppOptions, WhatsAppLogger

### Community 165 - "assertAppointmentBookable.ts"
Cohesion: 0.36
Nodes (6): assertAppointmentBookable(), countEligibleStaff(), DbClient, overlaps(), timeToMinutes(), assertPublicShopOperationalAccess()

### Community 166 - "VerifyEmailController.ts"
Cohesion: 0.43
Nodes (3): frontendBase(), VerifyEmailController, VerifyEmailUseCase

## Knowledge Gaps
- **587 isolated node(s):** `http`, `https`, `url`, `args`, `C` (+582 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **55 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `UpdateQueueItemUseCase.ts` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `@types/node`, `IExpenseResponseDTO`, `PostsController.ts`, `index.ts`, `@types/pg`, `AppError`, `IStorageProvider`, `appointments.spec.ts`, `IPlanResponseDTO`, `auth.routes.ts`, `MercadoPagoService`, `UpdateBarbershopUseCase`, `userSchemas.ts`, `RegisterUseCase.ts`, `DeleteQueueItemUseCase`, `sendWhatsAppMessage`, `SubscribeUseCase.ts`, `blockedEntityService.ts`, `cancelSubscription.spec.ts`, `LoginUseCase.ts`, `IUserResponseDTO`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `LogoController.ts`, `paymentSchemas.ts`, `assertAppointmentBookable.ts`, `VerifyEmailController.ts`, `planEconomics.ts`, `payments.spec.ts`, `referralService.ts`, `ContactController.ts`, `CreateBarbershopUseCase`, `QueueRepository`, `seed.ts`, `IAppointmentRepository`, `app.ts`, `GetPaymentStatusUseCase.ts`, `PlansController.ts`, `enqueueWhatsApp`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `prisma` connect `AppError` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `index.ts`, `IPlanResponseDTO`, `IAppointmentResponseDTO`, `auth.routes.ts`, `MercadoPagoService`, `sendWhatsAppMessage`, `userSchemas.ts`, `IUserResponseDTO`, `DeleteQueueItemUseCase`, `IPaymentResponseDTO`, `SubscribeUseCase.ts`, `blockedEntityService.ts`, `cancelSubscription.spec.ts`, `LoginUseCase.ts`, `BarbershopFinancialController.ts`, `LogoController.ts`, `assertAppointmentBookable.ts`, `VerifyEmailController.ts`, `planEconomics.ts`, `appointmentUseCases.ts`, `payments.spec.ts`, `referralService.ts`, `ContactController.ts`, `IEmailProvider.ts`, `server.ts`, `QueueRepository`, `seed.ts`, `IAppointmentRepository`, `app.ts`, `GetPaymentStatusUseCase.ts`, `PlansController.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `MercadoPagoService` connect `payments.spec.ts` to `@types/node`, `AbacatePayService`, `GetBarbershopUseCase.ts`, `index.ts`, `IPaymentResponseDTO`, `SubscribeUseCase.ts`, `LoginUseCase.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `authenticate()` (e.g. with `adminRoutes()` and `adminFinancialRoutes()`) actually correct?**
  _`authenticate()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **What connects `http`, `https`, `url` to the rest of the system?**
  _587 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IFiadoResponseDTO` be split into smaller, more focused modules?**
  _Cohesion score 0.06368330464716007 - nodes in this community are weakly interconnected._
- **Should `IServiceResponseDTO` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._