# Graph Report - agendai-back-end  (2026-08-29)

## Corpus Check
- 417 files · ~138,945 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2786 nodes · 6504 edges · 197 communities (139 shown, 58 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 176 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d7220dd4`
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
- assertAppointmentBookable.ts
- referralService.ts
- index.ts
- .findById
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
- AdminDashboardController.ts
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
- CheckInAppointmentController.ts
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
- ProcessAbacateWebhookController.ts
- node-cron
- CreateUserUseCase.ts
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
- authSchemas.ts
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
- QueueRepository
- Pentest local autorizado
- ListBarbershopsUseCase
- bruteForceProtection.ts
- RefundPaymentUseCase
- cancelSubscription.spec.ts
- PENTEST_REPORT_TEMPLATE.md
- fastify
- @prisma/adapter-pg
- @testcontainers/postgresql
- @types/jsonwebtoken
- AdminDashboardController.ts
- IQueueRepository
- issueAuthSession.ts
- sendWhatsAppMessage
- assertAppointmentBookable.ts
- ExportUserDataUseCase
- AdminNotificationController.ts
- AdminNotificationController
- google-auth-library
- @opentelemetry/api
- JoinQueueController.ts
- disposable-email-domains
- @opentelemetry/resources
- @opentelemetry/sdk-node
- @opentelemetry/semantic-conventions
- pino
- @sentry/node
- ListSubscriptionsController
- queue.spec.ts
- ForgotPasswordUseCase
- payments.routes.ts
- AdminBarbershopController
- ResetPasswordUseCase
- bruteForceProtection.spec.ts
- @fastify/rate-limit
- @google-cloud/storage
- pg
- @upstash/redis
- Runbook: Aplicar migrations do backend em Staging/Produção
- IClientPackageRepository
- packageUseCases.ts
- MercadoPagoService
- AppointmentRepository
- .execute
- app.ts
- postPublisher.cron.spec.ts

## God Nodes (most connected - your core abstractions)
1. `AppError` - 110 edges
2. `prisma` - 79 edges
3. `IBarbershopRepository` - 52 edges
4. `authenticate()` - 47 edges
5. `IPaymentResponseDTO` - 41 edges
6. `setRlsContext()` - 41 edges
7. `authorize()` - 38 edges
8. `checkSubscription()` - 38 edges
9. `IPaymentRepository` - 34 edges
10. `IQueueItemResponseDTO` - 34 edges

## Surprising Connections (you probably didn't know these)
- `buildAuthProbeApp()` --indirect_call--> `authenticate()`  [INFERRED]
  src/tests/pentest/auth-session.pentest.spec.ts → src/shared/infra/http/middlewares/authenticate.ts
- `scheduleAppointmentReminders()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/cron/appointmentReminders.cron.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `notificationsRoutes()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/http/routes/notifications.routes.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `paymentRoutes()` --indirect_call--> `abacateWebhookPreParsing()`  [INFERRED]
  src/shared/infra/http/routes/payments.routes.ts → src/modules/payments/useCases/processAbacateWebhook/ProcessAbacateWebhookController.ts
- `usersRoutes()` --indirect_call--> `validateDeleteAccount()`  [INFERRED]
  src/shared/infra/http/routes/users.routes.ts → src/modules/users/useCases/deleteAccount/DeleteAccountController.ts

## Import Cycles
- None detected.

## Communities (197 total, 58 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.21
Nodes (30): authenticate(), authorize(), checkDashboardAccess(), checkSubscription(), setRlsContext(), adminRoutes(), adminFinancialRoutes(), financial (+22 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.06
Nodes (38): FiadoController, FiadoStatus, ICreateFiadoDTO, ICreateFiadoPaymentDTO, IFiadoListQuery, IFiadoPaymentResponseDTO, IFiadoResponseDTO, IFiadoSummary (+30 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.06
Nodes (28): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, createServiceSchema, updateServiceSchema (+20 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.10
Nodes (20): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, TOPIC_LABEL (+12 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.19
Nodes (6): inject, buildQueueJoinedMessage(), notifyCustomerJoinedQueue(), NotifyQueuePositionUpdatesUseCase, inject, injectable

### Community 6 - "index.ts"
Cohesion: 0.06
Nodes (30): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository (+22 more)

### Community 7 - "compilerOptions"
Cohesion: 0.05
Nodes (37): ./*, config/*, dist, dtos/*, ES2022, libs/*, modules/*, node_modules (+29 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.20
Nodes (4): GetScheduleController, GetScheduleUseCase, inject, injectable

### Community 9 - "AppError"
Cohesion: 0.07
Nodes (26): adapter, pool, prisma, ICheckInDTO, ICheckInResult, logger, issueAuthSession(), mapRole() (+18 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.07
Nodes (29): 💈 AgendAI — Backend API, Autenticação, Com Docker (recomendado), Como obter o token JWT para o monitor, Como Rodar, Configuração do Ambiente, Documentação Swagger, Estrutura do Projeto (+21 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.08
Nodes (20): IBarbershopResponseDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO, BarbershopRepository, MockBarbershopRepository, ScheduleItem, IBarbershopRepository, CreateBarbershopUseCase (+12 more)

### Community 12 - "normalizeCpf"
Cohesion: 0.10
Nodes (34): WhatsAppConnectionController, assertShopAccess(), ShopWhatsAppDto, ShopWhatsAppStatus, inject, injectable, WhatsAppConnectionUseCase, requireOpenShopWhatsAppInstance() (+26 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.12
Nodes (29): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DEFAULT_PROVIDER_ORDER (+21 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.09
Nodes (14): AppointmentController, IAppointmentRepository, ADMIN, otherOwner, buildReminderMessage(), CancelAppointmentUseCase, CreateAppointmentUseCase, CreatePublicAppointmentUseCase (+6 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.06
Nodes (39): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+31 more)

### Community 16 - "IAppointmentResponseDTO"
Cohesion: 0.21
Nodes (3): IAppointmentResponseDTO, MockAppointmentRepository, todayInSaoPaulo()

### Community 17 - "auth.routes.ts"
Cohesion: 0.07
Nodes (31): IGetLogoUploadUrlDTO, IGetLogoUploadUrlResult, IUploadLogoDirectDTO, ALLOWED_MIME_SET, logger, UploadVideoController, IUploadVideoDTO, IUploadVideoResult (+23 more)

### Community 18 - "MercadoPagoService"
Cohesion: 0.18
Nodes (10): IPaymentResponseDTO, PaymentMethod, PaymentProvider, PaymentStatus, MockPaymentRepository, mapToDTO(), PaymentRepository, truncateRaw() (+2 more)

### Community 19 - "IUserResponseDTO"
Cohesion: 0.15
Nodes (11): ICreateUserDTO, RoleLiteral, IUserResponseDTO, MockUserRepository, publicSelect, UserRepository, IUserRepository, CreateUserController (+3 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.17
Nodes (8): GoogleLoginController, GoogleLoginUseCase, mockFindByEmail, mockUser, mockVerifyIdToken, prismaMock, inject, injectable

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.08
Nodes (20): ConfirmLogoUseCase, IConfirmLogoDTO, inject, injectable, DeleteLogoUseCase, inject, injectable, GetLogoUploadUrlUseCase (+12 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.20
Nodes (10): buildQueueUpdateMessage(), calendarDateParts(), createAppointmentAtomic(), formatSaoPauloTime(), mapCreatedAppointment(), ReminderResult, scheduledInstant(), debitClientPackageInTx() (+2 more)

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.08
Nodes (9): AbacatePayService, injectable, AsaasService, injectable, ProratedRefundInput, inject, inject, inject (+1 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.09
Nodes (21): AgendAI Back‑end — Manual do Sistema, Autenticação e Autorização, Banco de Dados (Prisma), Com Docker, Como Adicionar um Novo Caso de Uso/Endpoint, Convenções, Definições, Dicas para IA (+13 more)

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.14
Nodes (14): BlockedEntityAdminController, BlockInput, blockSchema, UnblockInput, unblockSchema, unblockOwnerCpfs(), BlockedEntityType, blockEntity() (+6 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.19
Nodes (16): availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR, timeField, UpdateAppointmentInput (+8 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.48
Nodes (3): blockOwnerCpfs(), shouldBlockOwnerCpfsOnDeniedAccess(), subscriptionGrantsAccess()

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.13
Nodes (12): BarbershopFinancialController, ExpenseRow, ExpenseWithCategory, FiadoRow, FiadoWithPayments, BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod (+4 more)

### Community 30 - "queue.spec.ts"
Cohesion: 0.16
Nodes (12): AdminBarbershopController, adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListBlockedEntitiesQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema (+4 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.15
Nodes (10): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+2 more)

### Community 32 - "emailWorker.ts"
Cohesion: 0.16
Nodes (22): VerifyEmailController, VerifyEmailUseCase, apiUrl(), buildVerifyEmail(), escapeHtml(), emailLayout(), frontendUrl(), buildReferralAppliedEmail() (+14 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.47
Nodes (7): AppointmentStatus, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentWithRelations, include

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.17
Nodes (14): IInvoiceResponseDTO, ISubscribeDTO, ISubscriptionResponseDTO, SubscriptionStatus, makeFullSubscription(), makeSubscription(), NOW, prismaMock (+6 more)

### Community 35 - "monitor-routes.js"
Cohesion: 0.17
Nodes (15): args, C, classify(), clearScreen(), http, https, pad(), render() (+7 more)

### Community 36 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, build, db:push, db:push:prod, db:studio, dev, dev:docker, prisma:generate (+16 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.18
Nodes (13): GetSubscriptionController, loadActivePlans(), SubscriptionEconomicsController, computePlanEconomics(), computePlatformEconomics(), inferTierKey(), monthsBetween(), PlanBillingCycle (+5 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.12
Nodes (16): Admin — Audit Logs, Admin — Dashboard, Admin — Financeiro, `GET /admin/audit-logs` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/dashboard`, `GET /admin/financial/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/overview` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/summary` 🔒 🛡️ `MASTER_ADMIN` (+8 more)

### Community 40 - "appointmentUseCases.ts"
Cohesion: 0.18
Nodes (17): EmailTemplateId, EmailJobData, emailQueue, emailQueueEvents, getEvents(), getQueue(), redisConnection, WhatsAppJobData (+9 more)

### Community 41 - "payments.spec.ts"
Cohesion: 0.20
Nodes (5): AdminFinancialController, EnrichedBarbershop, ExpenseRow, FiadoRow, FiadoSummaryRow

### Community 42 - "IQueueItemResponseDTO"
Cohesion: 0.12
Nodes (7): IQueueItemResponseDTO, MockQueueRepository, PrismaQueueStatus, QueueRepository, toDTO(), toPrisma(), QueueWaitEstimate

### Community 43 - "assertAppointmentBookable.ts"
Cohesion: 0.31
Nodes (7): GetAvailabilityUseCase, assertAppointmentBookable(), countEligibleStaff(), DbClient, overlaps(), timeToMinutes(), assertPublicShopOperationalAccess()

### Community 44 - "referralService.ts"
Cohesion: 0.19
Nodes (15): ReferralsController, ensureReferralCode(), generateCode(), getReferralDashboard(), logger, tierLabel(), GetMyReferralsUseCase, injectable (+7 more)

### Community 45 - "index.ts"
Cohesion: 0.20
Nodes (13): enqueuePostBroadcast(), getEvents(), getQueue(), PostBroadcastJobData, postBroadcastQueue, postBroadcastQueueEvents, createWorker(), ensurePostBroadcastWorker() (+5 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.40
Nodes (3): insideRlsTx, rlsExtension, RequestContext

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.16
Nodes (17): ENUM_TO_INPUT, logger, PostRow, postSelect, createPostSchema, generatePostSchema, getConfigQuerySchema, listScheduledQuerySchema (+9 more)

### Community 49 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, @testcontainers/postgresql, tsx, @types/bcryptjs, @types/busboy, @types/node, @types/node-cron, @types/pg (+9 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.13
Nodes (9): GetBarbershopController, ListPublicStaffUseCase, inject, injectable, ListBarbershopsController, ListBarbershopsUseCase, inject, injectable (+1 more)

### Community 51 - "server.ts"
Cohesion: 0.12
Nodes (18): ChargeTrialEndedSubscriptionsUseCase, injectable, CronLogger, TODO: este cron dispara em cada réplica do serviço. Hoje o backend roda em, scheduleAppointmentReminders(), ALLOWED_TABLES, cleanTable(), scheduleCleanOldLogs() (+10 more)

### Community 52 - "QueueRepository"
Cohesion: 0.12
Nodes (11): AuthConfig, ListPaymentsController, abacateWebhookPreParsing(), ListRefundsController, extractBearerToken(), JwtPayload, authenticateOptional(), JwtPayload (+3 more)

### Community 53 - "GcsStorageProvider"
Cohesion: 0.14
Nodes (11): asaasCreditCardSchema, identificationSchema, SetupTrialCardInput, setupTrialCardSchema, SubscribeInput, subscribeSchema, SetupTrialCardController, SetupTrialCardUseCase (+3 more)

### Community 54 - "9. Como Criar um Novo Módulo"
Cohesion: 0.18
Nodes (11): 9. Como Criar um Novo Módulo, Passo 10 — Schema Prisma, Passo 1 — DTOs, Passo 2 — Interface do Repositório, Passo 3 — Mock Repository (para testes), Passo 4 — Implementação Prisma, Passo 5 — Schemas Zod, Passo 6 — UseCases (+3 more)

### Community 55 - "Barbearias"
Cohesion: 0.18
Nodes (11): Barbearias, `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`, Logo — Fluxo via Signed URL (recomendado para produção), Logo — Upload Direto via Multipart (mais simples) (+3 more)

### Community 56 - "AppointmentRepository"
Cohesion: 0.11
Nodes (16): ClientPackageController, resolveBarbershopId(), ServicePackageController, BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField (+8 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.20
Nodes (10): 12. Erros Comuns e Como Evitá-los, ❌ Converter BigInt para Number, ❌ Esquecer de registrar o repositório no container, ❌ Esquecer `reflect-metadata` no setup de testes, ❌ Importar tipos Prisma do pacote diretamente, ❌ Instanciar Prisma fora de `prismaClient.ts`, ❌ Não registrar rota no `api.ts`, ❌ Passar string de token JWT diretamente em `expiresIn` (+2 more)

### Community 58 - "AdminDashboardController.ts"
Cohesion: 0.43
Nodes (5): AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period

### Community 59 - "IAppointmentRepository"
Cohesion: 0.29
Nodes (6): IEmailProvider, SendEmailInput, SendEmailResult, ResendEmailProvider, injectable, MockEmailProvider

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
Cohesion: 0.22
Nodes (8): ICreateServicePackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map(), ServicePackageRepository, IServicePackageRepository

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
Cohesion: 0.09
Nodes (14): GetPaymentStatusController, GetPaymentStatusUseCase, inject, injectable, ListPaymentsUseCase, inject, injectable, abacateServiceMock (+6 more)

### Community 70 - "CheckInAppointmentController.ts"
Cohesion: 0.33
Nodes (4): CheckInAppointmentController, checkInSchema, CheckInAppointmentUseCase, injectable

### Community 71 - "PlansController.ts"
Cohesion: 0.20
Nodes (17): agendaiWordmark(), buildPostSvg(), escapeXml(), formatBRL(), pngToDataUrl(), PostSvgInput, renderPostSvgToPng(), resolvePostFontFile() (+9 more)

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.23
Nodes (8): assertSameBarbershop(), assertShopWhatsAppConnected(), buildPostImage(), defaultCtaText(), loadPostContext(), PostsController, toPostResponse(), broadcastPostToClients()

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.29
Nodes (7): 6.1 Middlewares disponíveis, 6.2 Combinação padrão de preHandler, 6.3 Roles e permissões, 6.4 Acesso ao usuário no request, 6.5 Autorização em UseCases, 6.6 Token JWT, 6. Sistema de Autenticação e Autorização

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.29
Nodes (7): 8.1 Instância do Prisma, 8.2 UUIDs, 8.3 Soft delete vs hard delete, 8.4 Enum mapping, 8.5 Migrations vs db push, 8.6 BigInt, 8. Banco de Dados e Prisma

### Community 75 - "dependencies"
Cohesion: 0.12
Nodes (16): computeProratedAmount(), findApprovedPayment(), getProratedRefundInfo(), issueProratedRefund(), logger, ProratedRefundResult, abacateMock, asaasMock (+8 more)

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

### Community 105 - "bcryptjs"
Cohesion: 0.06
Nodes (37): logger, AsaasBillingType, AsaasCustomer, AsaasPayment, AsaasPixQrCode, AsaasRefund, logger, refundBodySchema (+29 more)

### Community 106 - "busboy"
Cohesion: 0.08
Nodes (23): ICreateCardPaymentDTO, ICreatePixPaymentDTO, billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema (+15 more)

### Community 107 - "dayjs"
Cohesion: 0.13
Nodes (15): publicSelect, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, EmployeePermission, RoleLiteral, cpfSchema, CreateUserDTO, createUserSchema (+7 more)

### Community 108 - "disposable-email-domains"
Cohesion: 0.15
Nodes (8): IPaymentRepository, allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessAsaasWebhookUseCase, inject, injectable

### Community 109 - "@fastify/cors"
Cohesion: 0.18
Nodes (11): bcryptjs, @fastify/swagger-ui, google-auth-library, ioredis, @opentelemetry/exporter-prometheus, dependencies, bcryptjs, @fastify/swagger-ui (+3 more)

### Community 118 - "ProcessAbacateWebhookController.ts"
Cohesion: 0.08
Nodes (10): AvatarController, ConfirmAvatarUseCase, inject, injectable, DeleteAvatarUseCase, inject, injectable, GetAvatarUploadUrlUseCase (+2 more)

### Community 120 - "CreateUserUseCase.ts"
Cohesion: 0.15
Nodes (11): IRegisterDTO, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate, mockTxScheduleCreateMany (+3 more)

### Community 131 - "@types/node"
Cohesion: 0.15
Nodes (10): AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput, CancelPaymentController, CancelPaymentUseCase, logger (+2 more)

### Community 133 - "authSchemas.ts"
Cohesion: 0.24
Nodes (4): DeleteBarbershopController, DeleteBarbershopUseCase, inject, injectable

### Community 135 - "vitest"
Cohesion: 0.13
Nodes (9): allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody, timingSafeStringEqual(), allowDevModeWebhooks(), IAbacateWebhookPayload, ProcessAbacateWebhookUseCase, skipApiVerification() (+1 more)

### Community 141 - "UpdateQueueItemUseCase.ts"
Cohesion: 0.16
Nodes (14): DeleteQueueItemUseCase, injectable, buildQueueCalledMessage(), buildQueueCancelledMessage(), logger, NotifyQueuePositionResult, computeInsertJoinedAt(), ALLOWED_TRANSITIONS (+6 more)

### Community 143 - "Pentest local — auth, sessão, pagamentos e webhooks (21 ago 2026)"
Cohesion: 0.18
Nodes (10): Achados e correções aplicadas neste ciclo, Casos executáveis (inclusos no plano), Casos manuais → automatizados, Controles validados (sem achado novo), Inventário Graphify, Limitações, PENTEST-AUTH-001 — Authorization sem validação de scheme `Bearer` (corrigido), PENTEST-AUTH-002 — Refresh JWT sem `jti` podia colidir no mesmo segundo (corrigido) (+2 more)

### Community 144 - "DeleteBarbershopUseCase"
Cohesion: 0.18
Nodes (11): buildCreateBody(), buildUpdateArgs(), CREATED_POST_ROW, fakeUser(), mockBarbershopFindUnique, mockBroadcast, mockFeedPostCreate, mockFeedPostFindUnique (+3 more)

### Community 145 - "sendWhatsAppMessage"
Cohesion: 0.20
Nodes (7): PlansController, planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 146 - "Pentest local — inputs, upload, XSS e exposição pública"
Cohesion: 0.25
Nodes (7): Achados confirmados, Controles validados, Evidência de mapeamento, Limitações e próximas verificações, PENTEST-INPUT-001 — URLs de imagem do feed sem esquema permitido, PENTEST-INPUT-002 — conteúdo HTML do feed é armazenado sem sanitização de domínio, Pentest local — inputs, upload, XSS e exposição pública

### Community 147 - "UpdateBarbershopUseCase"
Cohesion: 0.15
Nodes (11): createBarbershopSchema, phoneBR, scheduleItemSchema, updateBarbershopSchema, updateScheduleSchema, CreateBarbershopController, UpdateBarbershopController, UpdateScheduleController (+3 more)

### Community 148 - "QueueRepository"
Cohesion: 0.18
Nodes (10): updateQueueItemSchema, masterAdmin, spInstant(), staffShop1, staffShop2, todayIsoSP(), UpdateQueueItemController, inject (+2 more)

### Community 149 - "Pentest local autorizado"
Cohesion: 0.29
Nodes (6): Achado estático (corrigido), Ambiente isolado, Casos executáveis incluídos, Casos manuais (agora automatizados em `src/tests/pentest/`), Inventário assistido por Graphify, Pentest local autorizado

### Community 150 - "ListBarbershopsUseCase"
Cohesion: 0.10
Nodes (10): adapter, defaultPlans, pool, prisma, inject, inject, inject, IHashProvider (+2 more)

### Community 151 - "bruteForceProtection.ts"
Cohesion: 0.14
Nodes (13): LoginController, RedisRateLimitStore, getRedisConnection(), getEvents(), getQueue(), checkLock(), getLockDuration(), getRemainingTTL() (+5 more)

### Community 153 - "cancelSubscription.spec.ts"
Cohesion: 0.22
Nodes (5): DailyLimitExceededError, GeneratePostInput, baseInput, mockRedisGet, mockRedisSet

### Community 160 - "AdminDashboardController.ts"
Cohesion: 0.18
Nodes (14): AdminUserController, logger, RegisterUseCase, injectable, attachReferralOnRegister(), enqueueEmail(), assertCpfNotBlocked(), disposableSet (+6 more)

### Community 164 - "sendWhatsAppMessage"
Cohesion: 0.38
Nodes (3): ForgotPasswordController, ForgotPasswordUseCase, injectable

### Community 165 - "assertAppointmentBookable.ts"
Cohesion: 0.29
Nodes (4): ResetPasswordController, ResetPasswordUseCase, inject, injectable

### Community 166 - "ExportUserDataUseCase"
Cohesion: 0.21
Nodes (7): DeleteAccountController, validateDeleteAccount(), DeleteAccountUseCase, injectable, ExportUserDataController, ExportUserDataUseCase, injectable

### Community 167 - "AdminNotificationController.ts"
Cohesion: 0.17
Nodes (9): AdminAuditLogController, AdminReferralsController, auditLogController, barbershopController, blockedEntityController, dashboardController, notificationController, referralsController (+1 more)

### Community 169 - "google-auth-library"
Cohesion: 0.33
Nodes (3): mockEnqueue, mockFindMany, mockFindUnique

### Community 171 - "JoinQueueController.ts"
Cohesion: 0.22
Nodes (11): JoinQueueController, JoinQueueUseCase, inject, injectable, isQueueStaffForShop(), digits(), isActiveQueueDuplicate(), isPlaceholderWhatsApp() (+3 more)

### Community 179 - "queue.spec.ts"
Cohesion: 0.29
Nodes (4): IJoinQueueDTO, QueueStatus, IUpdateQueueItemDTO, IQueueRepository

### Community 181 - "ForgotPasswordUseCase"
Cohesion: 0.10
Nodes (24): forgotPasswordSchema, googleLoginSchema, loginSchema, phoneBR, refreshSchema, registerSchema, resetPasswordSchema, scheduleItemSchema (+16 more)

### Community 185 - "ResetPasswordUseCase"
Cohesion: 0.20
Nodes (9): mapRole(), MeController, mePreHandler(), logger, RECAPTCHA_MIN_SCORE, RecaptchaResponse, verifyRecaptcha(), verifyToken() (+1 more)

### Community 191 - "Runbook: Aplicar migrations do backend em Staging/Produção"
Cohesion: 0.12
Nodes (16): 1. Backup, 2. Marcar a baseline como aplicada (SEM executar), 3. Aplicar as migrations pendentes reais, 4. Validar, 5. Verificar funcionamento da aplicação, ⚠️ AÇÃO DESTRUTIVA PENDENTE DE APROVAÇÃO HUMANA, Coluna `userId` (UUID, FK → users), Contato (+8 more)

### Community 192 - "IClientPackageRepository"
Cohesion: 0.18
Nodes (5): IBookPackageSlotDTO, ISellClientPackageDTO, assertOwner(), assertPackageBookable(), assertShopAccess()

### Community 193 - "packageUseCases.ts"
Cohesion: 0.13
Nodes (18): ADMIN, futureDate, owner(), seedClientAndPackage(), BookClientPackageUseCase, CancelClientPackageUseCase, ConsumeClientPackageUseCase, CreateServicePackageUseCase (+10 more)

### Community 195 - "MercadoPagoService"
Cohesion: 0.16
Nodes (10): IBillingAddressDTO, ICardPayerDTO, IMercadoPagoWebhookDTO, IPixQrCodeDTO, ProcessWebhookController, webhookBodySchema, logger, ProcessWebhookUseCase (+2 more)

### Community 198 - "AppointmentRepository"
Cohesion: 0.29
Nodes (3): AppointmentRepository, mapToDTO(), todayInSaoPaulo()

### Community 199 - ".execute"
Cohesion: 0.33
Nodes (3): GetQueueWaitEstimateUseCase, inject, injectable

### Community 201 - "app.ts"
Cohesion: 0.39
Nodes (4): setupSwagger(), buildApp(), registerRoutes(), createTestApp()

### Community 203 - "postPublisher.cron.spec.ts"
Cohesion: 0.22
Nodes (8): mockBarbershopFindMany, mockBarbershopUpdate, mockBroadcast, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostUpdate, mockScheduleFindFirst, mockServiceFindMany

## Knowledge Gaps
- **698 isolated node(s):** `docker-entrypoint.sh script`, `http`, `https`, `url`, `args` (+693 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **58 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `auth.routes.ts` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `@types/node`, `index.ts`, `AppError`, `IBarbershopResponseDTO`, `normalizeCpf`, `UpdateQueueItemUseCase.ts`, `appointments.spec.ts`, `IPlanResponseDTO`, `sendWhatsAppMessage`, `IUserResponseDTO`, `QueueRepository`, `IPaymentDTO.ts`, `IPaymentResponseDTO`, `ListBarbershopsUseCase`, `blockedEntityService.ts`, `LoginUseCase.ts`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `LogoController.ts`, `AdminDashboardController.ts`, `paymentSchemas.ts`, `planEconomics.ts`, `payments.spec.ts`, `assertAppointmentBookable.ts`, `referralService.ts`, `IEmailProvider.ts`, `queue.spec.ts`, `QueueRepository`, `ForgotPasswordUseCase`, `GcsStorageProvider`, `AppointmentRepository`, `packageUseCases.ts`, `GetBarbershopUseCase.ts`, `CheckInAppointmentController.ts`, `app.ts`, `dependencies`, `bcryptjs`, `busboy`, `dayjs`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Why does `prisma` connect `AppError` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `index.ts`, `IBarbershopResponseDTO`, `IPlanResponseDTO`, `auth.routes.ts`, `MercadoPagoService`, `sendWhatsAppMessage`, `IUserResponseDTO`, `IPaymentResponseDTO`, `ListBarbershopsUseCase`, `blockedEntityService.ts`, `LoginUseCase.ts`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `LogoController.ts`, `AdminDashboardController.ts`, `IPaymentRepository`, `paymentSchemas.ts`, `planEconomics.ts`, `payments.spec.ts`, `assertAppointmentBookable.ts`, `JoinQueueController.ts`, `referralService.ts`, `IEmailProvider.ts`, `queue.spec.ts`, `server.ts`, `ForgotPasswordUseCase`, `AdminDashboardController.ts`, `app.ts`, `packageUseCases.ts`, `PlansController.ts`, `app.ts`, `dependencies`, `bcryptjs`, `busboy`, `dayjs`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `IBarbershopRepository` connect `IBarbershopResponseDTO` to `api.ts`, `IFiadoResponseDTO`, `authSchemas.ts`, `AbacatePayService`, `index.ts`, `IBarbershopRepository`, `JoinQueueController.ts`, `normalizeCpf`, `UpdateQueueItemUseCase.ts`, `appointments.spec.ts`, `auth.routes.ts`, `CreateBarbershopUseCase`, `queue.spec.ts`, `QueueRepository`, `IPaymentDTO.ts`, `ProcessAbacateWebhookController.ts`, `IPaymentResponseDTO`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `authenticate()` (e.g. with `adminRoutes()` and `adminFinancialRoutes()`) actually correct?**
  _`authenticate()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `http`, `https` to the rest of the system?**
  _698 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IFiadoResponseDTO` be split into smaller, more focused modules?**
  _Cohesion score 0.05757286192068801 - nodes in this community are weakly interconnected._
- **Should `IServiceResponseDTO` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._