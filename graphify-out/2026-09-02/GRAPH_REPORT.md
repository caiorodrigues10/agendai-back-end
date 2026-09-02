# Graph Report - agendai-back-end  (2026-09-01)

## Corpus Check
- 480 files · ~160,571 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3113 nodes · 7314 edges · 213 communities (146 shown, 67 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 200 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ba2fdf18`
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
- GetPaymentStatusUseCase
- ForgotPasswordUseCase
- payments.routes.ts
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
- referrals.routes.ts
- MercadoPagoService
- QueueStatus
- paymentStateMachine.ts
- AppointmentRepository
- .execute
- CancelPaymentUseCase
- Monitor de Rotas em Tempo Real
- prismaExtensions.ts
- postPublisher.cron.spec.ts
- planSchemas.ts
- subscribe.spec.ts
- app.ts
- Admin — Financeiro
- AdminBarbershopController
- OPENCODE_MIMO.md
- tsx
- @types/bcryptjs
- @types/busboy

## God Nodes (most connected - your core abstractions)
1. `AppError` - 128 edges
2. `prisma` - 97 edges
3. `authenticate()` - 53 edges
4. `IBarbershopRepository` - 52 edges
5. `authorize()` - 46 edges
6. `setRlsContext()` - 45 edges
7. `checkSubscription()` - 42 edges
8. `IPaymentResponseDTO` - 41 edges
9. `IQueueItemResponseDTO` - 37 edges
10. `getRedisConnection()` - 36 edges

## Surprising Connections (you probably didn't know these)
- `scheduleAppointmentReminders()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/cron/appointmentReminders.cron.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `notificationsRoutes()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/http/routes/notifications.routes.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `authRoutes()` --indirect_call--> `mePreHandler()`  [INFERRED]
  src/shared/infra/http/routes/auth.routes.ts → src/modules/auth/useCases/me/MeController.ts
- `onboardingRoutes()` --indirect_call--> `authenticate()`  [INFERRED]
  src/modules/barbershops/routes/onboarding.routes.ts → src/shared/infra/http/middlewares/authenticate.ts
- `paymentRoutes()` --indirect_call--> `abacateWebhookPreParsing()`  [INFERRED]
  src/shared/infra/http/routes/payments.routes.ts → src/modules/payments/useCases/processAbacateWebhook/ProcessAbacateWebhookController.ts

## Import Cycles
- None detected.

## Communities (213 total, 67 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.23
Nodes (29): authenticate(), authorize(), checkDashboardAccess(), setRlsContext(), adminRoutes(), adminFinancialRoutes(), apiRoutes(), appointmentsRoutes() (+21 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.05
Nodes (47): backfillCrmLedger(), EventInput, recordCrmFinancialEvent(), recordFiadoCreated(), recordFiadoPayment(), recordPackageSale(), recordQueueCompletion(), runCrmBackfill() (+39 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.06
Nodes (28): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, createServiceSchema, updateServiceSchema (+20 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.19
Nodes (11): assertSameBarbershop(), ENUM_TO_INPUT, FeedController, FeedRow, feedSelect, toResponse(), createFeedPostSchema, FEED_TYPE_MAP (+3 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.18
Nodes (8): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository

### Community 6 - "index.ts"
Cohesion: 0.05
Nodes (34): CommissionController, ICommissionEntryDTO, ICommissionSplitDTO, ICommissionSummary, IListCommissionsQuery, CommissionRepository, CommissionWithRelations, dateFilter() (+26 more)

### Community 7 - "compilerOptions"
Cohesion: 0.05
Nodes (37): ./*, config/*, dist, dtos/*, ES2022, libs/*, modules/*, node_modules (+29 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.20
Nodes (4): GetScheduleController, GetScheduleUseCase, inject, injectable

### Community 9 - "AppError"
Cohesion: 0.06
Nodes (35): sensitiveRoutes, adapter, pool, prisma, EnrichedBarbershop, ExpenseRow, FiadoRow, FiadoSummaryRow (+27 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.08
Nodes (23): 💈 AgendAI — Backend API, Autenticação, Com Docker (recomendado), Como Rodar, Configuração do Ambiente, Documentação Swagger, Estrutura do Projeto, Fluxo de assinatura (+15 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.11
Nodes (15): IBarbershopResponseDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO, BarbershopRepository, MockBarbershopRepository, ScheduleItem, IBarbershopRepository, CreateBarbershopUseCase (+7 more)

### Community 12 - "normalizeCpf"
Cohesion: 0.10
Nodes (34): WhatsAppConnectionController, assertShopAccess(), ShopWhatsAppDto, ShopWhatsAppStatus, inject, injectable, WhatsAppConnectionUseCase, requireOpenShopWhatsAppInstance() (+26 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.12
Nodes (29): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DEFAULT_PROVIDER_ORDER (+21 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.10
Nodes (13): AppointmentController, ADMIN, otherOwner, CancelAppointmentUseCase, CreateAppointmentUseCase, CreatePublicAppointmentUseCase, GetAppointmentUseCase, GetAvailabilityUseCase (+5 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.06
Nodes (45): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+37 more)

### Community 16 - "IAppointmentResponseDTO"
Cohesion: 0.20
Nodes (10): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentWithRelations, include (+2 more)

### Community 17 - "auth.routes.ts"
Cohesion: 0.18
Nodes (10): ALLOWED_MIME_SET, logger, UploadVideoController, IUploadVideoDTO, IUploadVideoResult, inject, injectable, UploadVideoUseCase (+2 more)

### Community 18 - "MercadoPagoService"
Cohesion: 0.16
Nodes (13): IBillingAddressDTO, ICardPayerDTO, IPaymentResponseDTO, IPixQrCodeDTO, PaymentMethod, PaymentProvider, PaymentStatus, MockPaymentRepository (+5 more)

### Community 19 - "IUserResponseDTO"
Cohesion: 0.06
Nodes (30): inject, LogoutController, LogoutUseCase, injectable, ICreateUserDTO, RoleLiteral, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS (+22 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.06
Nodes (32): CrmController, resolveCampaignClientIds(), resolveShop(), CrmCampaignListItem, CrmClientMetrics, CrmForecastDTO, CrmOverviewDTO, CrmSegment (+24 more)

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.05
Nodes (40): ConfirmLogoUseCase, IConfirmLogoDTO, inject, injectable, DeleteLogoUseCase, inject, injectable, GetLogoUploadUrlUseCase (+32 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.17
Nodes (10): buildQueueUpdateMessage(), calendarDateParts(), createAppointmentAtomic(), formatSaoPauloTime(), mapCreatedAppointment(), ReminderResult, scheduledInstant(), debitClientPackageInTx() (+2 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.09
Nodes (21): AgendAI Back‑end — Manual do Sistema, Autenticação e Autorização, Banco de Dados (Prisma), Com Docker, Como Adicionar um Novo Caso de Uso/Endpoint, Convenções, Definições, Dicas para IA (+13 more)

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.09
Nodes (30): AdminUserController, BlockedEntityAdminController, adminListBlockedEntitiesQuerySchema, BlockInput, blockSchema, UnblockInput, unblockSchema, logger (+22 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.18
Nodes (16): availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR, timeField, UpdateAppointmentInput (+8 more)

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.31
Nodes (7): BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod, normalizeWhatsapp(), periodDays(), round2(), WEEKDAY_LABELS

### Community 30 - "queue.spec.ts"
Cohesion: 0.24
Nodes (10): adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema, adminUpdateUserSchema, searchQuerySchema (+2 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.15
Nodes (10): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+2 more)

### Community 32 - "emailWorker.ts"
Cohesion: 0.16
Nodes (21): VerifyEmailController, VerifyEmailUseCase, apiUrl(), buildVerifyEmail(), escapeHtml(), emailLayout(), frontendUrl(), buildReferralAppliedEmail() (+13 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.24
Nodes (5): allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody, timingSafeStringEqual(), IAbacateWebhookPayload

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.13
Nodes (15): assertPaymentProviderEnabled(), EnabledPaymentProvider, enabledPaymentProviders(), AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput (+7 more)

### Community 35 - "monitor-routes.js"
Cohesion: 0.22
Nodes (8): args, base, once, probe(), run(), serviceId, shopId, token

### Community 36 - "scripts"
Cohesion: 0.08
Nodes (25): scripts, build, db:push, db:push:prod, db:studio, dev, dev:docker, prisma:generate (+17 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.21
Nodes (12): SubscriptionEconomicsController, computePlanEconomics(), computePlatformEconomics(), inferBillingCycle(), inferTierKey(), monthsBetween(), PlanBillingCycle, PlanCycleInfo (+4 more)

### Community 38 - "index.ts"
Cohesion: 0.12
Nodes (8): IDateProvider, DayjsDateProvider, CachedWeatherProvider, DEFAULT_CONDITION, OpenMeteoWeatherProvider, WMO_CODES, DailyForecast, IWeatherProvider

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.08
Nodes (24): Admin — Assinaturas, Admin — Audit Logs, Admin — Dashboard, Admin — Planos, Assinaturas, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER` (+16 more)

### Community 40 - "appointmentUseCases.ts"
Cohesion: 0.15
Nodes (19): TOPIC_LABEL, EmailTemplateId, EmailJobData, emailQueue, emailQueueEvents, getEvents(), getQueue(), redisConnection (+11 more)

### Community 41 - "payments.spec.ts"
Cohesion: 0.13
Nodes (11): DemandPrediction, FEATURE_NAMES, RECOMMENDATIONS, WeatherDataPoint, WeatherForecastPoint, TreeNode, TreeOptions, SeasonalDecomposition (+3 more)

### Community 42 - "IQueueItemResponseDTO"
Cohesion: 0.14
Nodes (3): IQueueItemResponseDTO, MockQueueRepository, QueueRepository

### Community 43 - "assertAppointmentBookable.ts"
Cohesion: 0.36
Nodes (6): assertAppointmentBookable(), countEligibleStaff(), DbClient, overlaps(), timeToMinutes(), assertPublicShopOperationalAccess()

### Community 44 - "referralService.ts"
Cohesion: 0.12
Nodes (6): IQueueRepository, inject, inject, assertQueueStatusTransition(), parseQueueStatus(), VALID_STATUSES

### Community 45 - "index.ts"
Cohesion: 0.20
Nodes (13): enqueuePostBroadcast(), getEvents(), getQueue(), PostBroadcastJobData, postBroadcastQueue, postBroadcastQueueEvents, createWorker(), ensurePostBroadcastWorker() (+5 more)

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.16
Nodes (17): ENUM_TO_INPUT, logger, PostRow, postSelect, createPostSchema, generatePostSchema, getConfigQuerySchema, listScheduledQuerySchema (+9 more)

### Community 49 - "devDependencies"
Cohesion: 0.12
Nodes (17): dotenv-cli, devDependencies, dotenv-cli, prisma, @testcontainers/postgresql, @types/node, @types/node-cron, @types/pg (+9 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.11
Nodes (12): GetBarbershopController, GetBarbershopUseCase, inject, injectable, ListPublicStaffUseCase, inject, injectable, ListBarbershopsController (+4 more)

### Community 51 - "server.ts"
Cohesion: 0.07
Nodes (37): ChargeTrialEndedSubscriptionsUseCase, inject, injectable, getProcessRole(), ProcessRole, shouldRunApi(), shouldRunCrons(), shouldRunWorkers() (+29 more)

### Community 52 - "QueueRepository"
Cohesion: 0.18
Nodes (15): blockOwnerCpfs(), SUBSCRIPTION_STATUS_CONFIG, extractBearerToken(), JwtPayload, authenticateOptional(), JwtPayload, checkSubscription(), getCachedAccess() (+7 more)

### Community 53 - "GcsStorageProvider"
Cohesion: 0.22
Nodes (8): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, injectable

### Community 54 - "9. Como Criar um Novo Módulo"
Cohesion: 0.18
Nodes (11): 9. Como Criar um Novo Módulo, Passo 10 — Schema Prisma, Passo 1 — DTOs, Passo 2 — Interface do Repositório, Passo 3 — Mock Repository (para testes), Passo 4 — Implementação Prisma, Passo 5 — Schemas Zod, Passo 6 — UseCases (+3 more)

### Community 55 - "Barbearias"
Cohesion: 0.18
Nodes (11): Barbearias, `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`, Logo — Fluxo via Signed URL (recomendado para produção), Logo — Upload Direto via Multipart (mais simples) (+3 more)

### Community 56 - "AppointmentRepository"
Cohesion: 0.08
Nodes (24): ClientPackageController, resolveBarbershopId(), ServicePackageController, BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField (+16 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.20
Nodes (10): 12. Erros Comuns e Como Evitá-los, ❌ Converter BigInt para Number, ❌ Esquecer de registrar o repositório no container, ❌ Esquecer `reflect-metadata` no setup de testes, ❌ Importar tipos Prisma do pacote diretamente, ❌ Instanciar Prisma fora de `prismaClient.ts`, ❌ Não registrar rota no `api.ts`, ❌ Passar string de token JWT diretamente em `expiresIn` (+2 more)

### Community 58 - "AdminDashboardController.ts"
Cohesion: 0.15
Nodes (8): ICreateCardPaymentDTO, ICreatePixPaymentDTO, MercadoPagoService, MPPaymentResponse, injectable, ProratedRefundInput, logger, inject

### Community 59 - "IAppointmentRepository"
Cohesion: 0.28
Nodes (7): IEmailProvider, SendEmailInput, SendEmailResult, logger, ResendEmailProvider, injectable, MockEmailProvider

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
Cohesion: 0.18
Nodes (11): IBookPackageSlotDTO, ICreateServicePackageDTO, ISellClientPackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map() (+3 more)

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
Cohesion: 0.11
Nodes (10): ListPaymentsUseCase, inject, injectable, abacateServiceMock, asaasServiceMock, mockMpCancel, mockMpCard, mockMpGet (+2 more)

### Community 70 - "CheckInAppointmentController.ts"
Cohesion: 0.22
Nodes (7): CheckInAppointmentController, checkInSchema, CheckInAppointmentUseCase, ICheckInDTO, ICheckInResult, logger, injectable

### Community 71 - "PlansController.ts"
Cohesion: 0.19
Nodes (18): broadcastPostToClients(), agendaiWordmark(), buildPostSvg(), escapeXml(), formatBRL(), pngToDataUrl(), PostSvgInput, renderPostSvgToPng() (+10 more)

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.25
Nodes (7): assertSameBarbershop(), assertShopWhatsAppConnected(), buildPostImage(), defaultCtaText(), loadPostContext(), PostsController, toPostResponse()

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.29
Nodes (7): 6.1 Middlewares disponíveis, 6.2 Combinação padrão de preHandler, 6.3 Roles e permissões, 6.4 Acesso ao usuário no request, 6.5 Autorização em UseCases, 6.6 Token JWT, 6. Sistema de Autenticação e Autorização

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.29
Nodes (7): 8.1 Instância do Prisma, 8.2 UUIDs, 8.3 Soft delete vs hard delete, 8.4 Enum mapping, 8.5 Migrations vs db push, 8.6 BigInt, 8. Banco de Dados e Prisma

### Community 75 - "dependencies"
Cohesion: 0.19
Nodes (12): computeProratedAmount(), findApprovedPayment(), getProratedRefundInfo(), issueProratedRefund(), logger, ProratedRefundResult, subscriptionRefPrefixes(), CancellationContextController (+4 more)

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
Cohesion: 0.22
Nodes (4): CronLockOptions, withCronLock(), DistributedLock, RedisDistributedLock

### Community 99 - "Admin — Barbearias"
Cohesion: 0.50
Nodes (4): Admin — Barbearias, `GET /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/barbershops/:id/status` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`

### Community 100 - "Admin — Planos"
Cohesion: 0.26
Nodes (7): DeleteQueueItemController, DeleteQueueItemUseCase, injectable, ALLOWED_TRANSITIONS, assertQueueTenantAccess(), logger, QueueRequestingUser

### Community 101 - "Assinaturas"
Cohesion: 0.24
Nodes (7): CompleteServiceController, completeServiceSchema, CompleteServiceRequest, CompleteServiceUseCase, logger, normalizeWhatsapp(), injectable

### Community 102 - "Auth"
Cohesion: 0.50
Nodes (4): Auth, `GET /auth/me` 🔒, `POST /auth/login`, `POST /auth/refresh`

### Community 103 - "Financeiro da Barbearia"
Cohesion: 0.50
Nodes (4): Financeiro da Barbearia, `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋

### Community 105 - "bcryptjs"
Cohesion: 0.08
Nodes (38): AsaasBillingType, AsaasCustomer, AsaasPayment, AsaasPixQrCode, AsaasRefund, logger, refundBodySchema, RefundPaymentController (+30 more)

### Community 106 - "busboy"
Cohesion: 0.06
Nodes (34): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+26 more)

### Community 107 - "dayjs"
Cohesion: 0.20
Nodes (4): BarbershopFinancialController, GetWeatherInsightsUseCase, inject, injectable

### Community 108 - "disposable-email-domains"
Cohesion: 0.14
Nodes (10): IPaymentRepository, inject, allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessAsaasWebhookUseCase, inject (+2 more)

### Community 109 - "@fastify/cors"
Cohesion: 0.18
Nodes (11): bcryptjs, @fastify/swagger-ui, google-auth-library, ioredis, @opentelemetry/exporter-prometheus, dependencies, bcryptjs, @fastify/swagger-ui (+3 more)

### Community 118 - "ProcessAbacateWebhookController.ts"
Cohesion: 0.15
Nodes (6): ConfirmAvatarUseCase, inject, injectable, DeleteAvatarUseCase, inject, injectable

### Community 120 - "CreateUserUseCase.ts"
Cohesion: 0.15
Nodes (11): IRegisterDTO, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate, mockTxScheduleCreateMany (+3 more)

### Community 131 - "@types/node"
Cohesion: 0.15
Nodes (7): AbacatePayService, injectable, ISubscribeDTO, frontendBaseUrl(), SubscribeUseCase, inject, injectable

### Community 133 - "authSchemas.ts"
Cohesion: 0.24
Nodes (4): DeleteBarbershopController, DeleteBarbershopUseCase, inject, injectable

### Community 135 - "vitest"
Cohesion: 0.19
Nodes (6): allowDevModeWebhooks(), ProcessAbacateWebhookUseCase, skipApiVerification(), injectable, handleSubscriptionPaymentWebhook(), prismaMock

### Community 141 - "UpdateQueueItemUseCase.ts"
Cohesion: 0.10
Nodes (20): updateQueueItemSchema, buildQueueCalledMessage(), buildQueueCancelledMessage(), buildQueueJoinedMessage(), logger, notifyCustomerJoinedQueue(), NotifyQueuePositionResult, NotifyQueuePositionUpdatesUseCase (+12 more)

### Community 143 - "Pentest local — auth, sessão, pagamentos e webhooks (21 ago 2026)"
Cohesion: 0.18
Nodes (10): Achados e correções aplicadas neste ciclo, Casos executáveis (inclusos no plano), Casos manuais → automatizados, Controles validados (sem achado novo), Inventário Graphify, Limitações, PENTEST-AUTH-001 — Authorization sem validação de scheme `Bearer` (corrigido), PENTEST-AUTH-002 — Refresh JWT sem `jti` podia colidir no mesmo segundo (corrigido) (+2 more)

### Community 144 - "DeleteBarbershopUseCase"
Cohesion: 0.18
Nodes (11): buildCreateBody(), buildUpdateArgs(), CREATED_POST_ROW, fakeUser(), mockBarbershopFindUnique, mockBroadcast, mockFeedPostCreate, mockFeedPostFindUnique (+3 more)

### Community 146 - "Pentest local — inputs, upload, XSS e exposição pública"
Cohesion: 0.25
Nodes (7): Achados confirmados, Controles validados, Evidência de mapeamento, Limitações e próximas verificações, PENTEST-INPUT-001 — URLs de imagem do feed sem esquema permitido, PENTEST-INPUT-002 — conteúdo HTML do feed é armazenado sem sanitização de domínio, Pentest local — inputs, upload, XSS e exposição pública

### Community 147 - "UpdateBarbershopUseCase"
Cohesion: 0.13
Nodes (11): createBarbershopSchema, phoneBR, scheduleItemSchema, updateBarbershopSchema, updateScheduleSchema, CreateBarbershopController, UpdateBarbershopController, UpdateScheduleController (+3 more)

### Community 149 - "Pentest local autorizado"
Cohesion: 0.29
Nodes (6): Achado estático (corrigido), Ambiente isolado, Casos executáveis incluídos, Casos manuais (agora automatizados em `src/tests/pentest/`), Inventário assistido por Graphify, Pentest local autorizado

### Community 150 - "ListBarbershopsUseCase"
Cohesion: 0.09
Nodes (13): logger, LoginUseCase, inject, injectable, UserLike, UserWithEmailPassword, inject, ResetPasswordController (+5 more)

### Community 151 - "bruteForceProtection.ts"
Cohesion: 0.15
Nodes (12): LoginController, RedisRateLimitStore, getRedisConnection(), getEvents(), checkLock(), getLockDuration(), getRemainingTTL(), lockTimers (+4 more)

### Community 153 - "cancelSubscription.spec.ts"
Cohesion: 0.22
Nodes (5): adapter, defaultPlans, pool, prisma, BcryptHashProvider

### Community 157 - "@testcontainers/postgresql"
Cohesion: 0.22
Nodes (5): DailyLimitExceededError, GeneratePostInput, baseInput, mockRedisGet, mockRedisSet

### Community 164 - "sendWhatsAppMessage"
Cohesion: 0.38
Nodes (3): ForgotPasswordController, ForgotPasswordUseCase, injectable

### Community 165 - "assertAppointmentBookable.ts"
Cohesion: 0.33
Nodes (3): issueProratedRefundMock, prismaMock, CancelSubscriptionController

### Community 166 - "ExportUserDataUseCase"
Cohesion: 0.13
Nodes (12): ProfileController, inject, injectable, DeleteAccountController, validateDeleteAccount(), DeleteAccountUseCase, inject, injectable (+4 more)

### Community 167 - "AdminNotificationController.ts"
Cohesion: 0.10
Nodes (15): AdminAuditLogController, AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period, AdminNotificationController, AdminReferralsController (+7 more)

### Community 168 - "AdminNotificationController"
Cohesion: 0.29
Nodes (4): abacateMock, asaasMock, mpMock, prismaMock

### Community 169 - "google-auth-library"
Cohesion: 0.33
Nodes (3): mockEnqueue, mockFindMany, mockFindUnique

### Community 171 - "JoinQueueController.ts"
Cohesion: 0.23
Nodes (10): JoinQueueController, JoinQueueUseCase, inject, injectable, isQueueStaffForShop(), digits(), isActiveQueueDuplicate(), isPlaceholderWhatsApp() (+2 more)

### Community 179 - "queue.spec.ts"
Cohesion: 0.23
Nodes (8): IJoinQueueDTO, QueueStatus, IUpdateQueueItemDTO, PrismaQueueStatus, toDTO(), toPrisma(), QueueWaitEstimate, computeIdentityKey()

### Community 180 - "GetPaymentStatusUseCase"
Cohesion: 0.33
Nodes (4): GetPaymentStatusController, GetPaymentStatusUseCase, inject, injectable

### Community 181 - "ForgotPasswordUseCase"
Cohesion: 0.08
Nodes (31): forgotPasswordSchema, googleLoginSchema, loginSchema, phoneBR, refreshSchema, registerSchema, resetPasswordSchema, scheduleItemSchema (+23 more)

### Community 183 - "payments.routes.ts"
Cohesion: 0.33
Nodes (4): abacateWebhookPreParsing(), ListRefundsController, checkoutRateLimit, webhookRateLimit

### Community 185 - "ResetPasswordUseCase"
Cohesion: 0.15
Nodes (13): validateGoogleLogin, validateLogin, mapRole(), MeController, mePreHandler(), validateRefresh, validateRegister, logger (+5 more)

### Community 191 - "Runbook: Aplicar migrations do backend em Staging/Produção"
Cohesion: 0.12
Nodes (16): 1. Backup, 2. Marcar a baseline como aplicada (SEM executar), 3. Aplicar as migrations pendentes reais, 4. Validar, 5. Verificar funcionamento da aplicação, ⚠️ AÇÃO DESTRUTIVA PENDENTE DE APROVAÇÃO HUMANA, Coluna `userId` (UUID, FK → users), Contato (+8 more)

### Community 192 - "IClientPackageRepository"
Cohesion: 0.17
Nodes (7): assertOwner(), assertPackageBookable(), assertShopAccess(), batchSlotsOverlap(), IBatchSlot, overlaps(), timeToMinutes()

### Community 193 - "packageUseCases.ts"
Cohesion: 0.25
Nodes (7): Alertas mínimos, Auditoria de dados sensíveis, Backup, restauração e rollback, Gate de lançamento, Operação do MVP público, Smoke comportamental, Staging isolado

### Community 194 - "referrals.routes.ts"
Cohesion: 0.31
Nodes (4): ReferralsController, applyReferralCode(), GetMyReferralsUseCase, injectable

### Community 195 - "MercadoPagoService"
Cohesion: 0.26
Nodes (6): IMercadoPagoWebhookDTO, ProcessWebhookController, webhookBodySchema, logger, ProcessWebhookUseCase, injectable

### Community 196 - "QueueStatus"
Cohesion: 0.32
Nodes (5): onboardingRoutes(), GetOnboardingUseCase, injectable, injectable, UpdateOnboardingStepUseCase

### Community 197 - "paymentStateMachine.ts"
Cohesion: 0.32
Nodes (7): applyTransition(), getNextStatus(), isValidTransition(), SubscriptionEvent, SubscriptionStatus, TRANSITION_TABLE, TRANSITIONS

### Community 198 - "AppointmentRepository"
Cohesion: 0.29
Nodes (3): AppointmentRepository, mapToDTO(), todayInSaoPaulo()

### Community 199 - ".execute"
Cohesion: 0.13
Nodes (6): IAppointmentRepository, buildReminderMessage(), restoreClientPackageInTx(), GetQueueWaitEstimateUseCase, inject, injectable

### Community 200 - "CancelPaymentUseCase"
Cohesion: 0.33
Nodes (4): CancelPaymentController, CancelPaymentUseCase, inject, injectable

### Community 201 - "Monitor de Rotas em Tempo Real"
Cohesion: 0.33
Nodes (6): Como obter o token JWT para o monitor, Interpretação dos status, Monitor de Rotas em Tempo Real, O que o monitor exibe, Requisitos do monitor, Uso básico

### Community 202 - "prismaExtensions.ts"
Cohesion: 0.40
Nodes (3): insideRlsTx, rlsExtension, RequestContext

### Community 203 - "postPublisher.cron.spec.ts"
Cohesion: 0.22
Nodes (8): mockBarbershopFindMany, mockBarbershopUpdate, mockBroadcast, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostUpdate, mockScheduleFindFirst, mockServiceFindMany

### Community 204 - "planSchemas.ts"
Cohesion: 0.33
Nodes (5): billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 205 - "subscribe.spec.ts"
Cohesion: 0.53
Nodes (4): makeFullSubscription(), makeSubscription(), NOW, prismaMock

### Community 207 - "Admin — Financeiro"
Cohesion: 0.50
Nodes (4): Admin — Financeiro, `GET /admin/financial/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/overview` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/summary` 🔒 🛡️ `MASTER_ADMIN`

## Knowledge Gaps
- **744 isolated node(s):** `docker-entrypoint.sh script`, `args`, `base`, `token`, `shopId` (+739 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **67 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `AppError` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `index.ts`, `IBarbershopResponseDTO`, `normalizeCpf`, `UpdateQueueItemUseCase.ts`, `appointments.spec.ts`, `IPlanResponseDTO`, `auth.routes.ts`, `IUserResponseDTO`, `RegisterUseCase.ts`, `IPaymentDTO.ts`, `IPaymentResponseDTO`, `ListBarbershopsUseCase`, `blockedEntityService.ts`, `queue.spec.ts`, `LogoController.ts`, `AdminDashboardController.ts`, `paymentSchemas.ts`, `assertAppointmentBookable.ts`, `IEmailProvider.ts`, `queue.spec.ts`, `QueueRepository`, `ForgotPasswordUseCase`, `GcsStorageProvider`, `AppointmentRepository`, `ResetPasswordUseCase`, `AdminDashboardController.ts`, `app.ts`, `referrals.routes.ts`, `GetBarbershopUseCase.ts`, `CheckInAppointmentController.ts`, `dependencies`, `app.ts`, `Admin — Planos`, `Assinaturas`, `bcryptjs`, `busboy`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `prisma` connect `AppError` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `IBarbershopResponseDTO`, `IPlanResponseDTO`, `IAppointmentResponseDTO`, `MercadoPagoService`, `IUserResponseDTO`, `RegisterUseCase.ts`, `IPaymentResponseDTO`, `ListBarbershopsUseCase`, `blockedEntityService.ts`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `LogoController.ts`, `paymentSchemas.ts`, `planEconomics.ts`, `AdminNotificationController.ts`, `appointmentUseCases.ts`, `assertAppointmentBookable.ts`, `JoinQueueController.ts`, `IEmailProvider.ts`, `queue.spec.ts`, `server.ts`, `ForgotPasswordUseCase`, `QueueRepository`, `IAppointmentRepository`, `app.ts`, `CheckInAppointmentController.ts`, `PlansController.ts`, `dependencies`, `app.ts`, `Admin — Assinaturas`, `Assinaturas`, `bcryptjs`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `IBarbershopRepository` connect `IBarbershopResponseDTO` to `IFiadoResponseDTO`, `authSchemas.ts`, `index.ts`, `.execute`, `IBarbershopRepository`, `AppError`, `JoinQueueController.ts`, `normalizeCpf`, `UpdateQueueItemUseCase.ts`, `referralService.ts`, `auth.routes.ts`, `CreateBarbershopUseCase`, `UpdateBarbershopUseCase`, `queue.spec.ts`, `IPaymentDTO.ts`, `ProcessAbacateWebhookController.ts`, `IPaymentResponseDTO`, `QueueRepository`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 24 inferred relationships involving `authenticate()` (e.g. with `onboardingRoutes()` and `adminRoutes()`) actually correct?**
  _`authenticate()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `args`, `base` to the rest of the system?**
  _744 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IFiadoResponseDTO` be split into smaller, more focused modules?**
  _Cohesion score 0.050637730820483534 - nodes in this community are weakly interconnected._
- **Should `IServiceResponseDTO` be split into smaller, more focused modules?**
  _Cohesion score 0.06054054054054054 - nodes in this community are weakly interconnected._