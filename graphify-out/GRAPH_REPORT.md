# Graph Report - agendai-back-end  (2026-09-02)

## Corpus Check
- 513 files · ~174,959 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3308 nodes · 7932 edges · 211 communities (149 shown, 62 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 212 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5e4f0443`
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
- 14. Integrações Externas
- 5. Convenções de Código
- Admin — Entidades Bloqueadas
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
- setup.ts
- vitest.config.mts
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
- app.security.spec.ts
- AdminDashboardController.ts
- IQueueRepository
- issueAuthSession.ts
- AsaasService.ts
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
- CompleteServiceUseCase.ts
- authenticate.ts
- assertOperationEnabled.ts
- index.ts
- ProcessAsaasWebhookUseCase.ts
- resendWebhookService.ts
- IPaymentRepository
- queueDuplicate.ts
- CheckInAppointmentUseCase.ts
- onboarding.routes.ts
- ResetPasswordUseCase
- notifications.routes.ts
- seed.ts
- bcryptjs
- ListSubscriptionsController

## God Nodes (most connected - your core abstractions)
1. `AppError` - 137 edges
2. `prisma` - 110 edges
3. `IBarbershopRepository` - 56 edges
4. `authenticate()` - 53 edges
5. `setRlsContext()` - 47 edges
6. `getRedisConnection()` - 47 edges
7. `authorize()` - 46 edges
8. `checkSubscription()` - 44 edges
9. `IPaymentResponseDTO` - 41 edges
10. `IQueueItemResponseDTO` - 37 edges

## Surprising Connections (you probably didn't know these)
- `buildAuthProbeApp()` --indirect_call--> `authenticate()`  [INFERRED]
  src/tests/pentest/auth-session.pentest.spec.ts → src/shared/infra/http/middlewares/authenticate.ts
- `notificationsRoutes()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/http/routes/notifications.routes.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `onboardingRoutes()` --indirect_call--> `authenticate()`  [INFERRED]
  src/modules/barbershops/routes/onboarding.routes.ts → src/shared/infra/http/middlewares/authenticate.ts
- `onboardingRoutes()` --indirect_call--> `checkSubscription()`  [INFERRED]
  src/modules/barbershops/routes/onboarding.routes.ts → src/shared/infra/http/middlewares/checkSubscription.ts
- `onboardingRoutes()` --indirect_call--> `setRlsContext()`  [INFERRED]
  src/modules/barbershops/routes/onboarding.routes.ts → src/shared/infra/http/middlewares/setRlsContext.ts

## Import Cycles
- None detected.

## Communities (211 total, 62 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.20
Nodes (30): ExportFinancialDataUseCase, injectable, authenticate(), authorize(), checkDashboardAccess(), checkSubscription(), setRlsContext(), adminRoutes() (+22 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.06
Nodes (38): FiadoController, FiadoStatus, ICreateFiadoDTO, ICreateFiadoPaymentDTO, IFiadoListQuery, IFiadoPaymentResponseDTO, IFiadoResponseDTO, IFiadoSummary (+30 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.19
Nodes (8): CompleteAppointmentController, completeAppointmentSchema, CompleteAppointmentRequest, CompleteAppointmentUseCase, inject, injectable, CompleteServiceUseCase, injectable

### Community 3 - "PostsController.ts"
Cohesion: 0.06
Nodes (40): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+32 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.07
Nodes (30): CrmController, resolveCampaignClientIds(), resolveShop(), CrmCampaignListItem, CrmClientMetrics, CrmForecastDTO, CrmOverviewDTO, CrmSegment (+22 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.06
Nodes (28): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, createServiceSchema, updateServiceSchema (+20 more)

### Community 6 - "index.ts"
Cohesion: 0.07
Nodes (39): AsaasBillingType, AsaasCustomer, AsaasPayment, AsaasPixQrCode, AsaasRefund, logger, computeProratedAmount(), findApprovedPayment() (+31 more)

### Community 7 - "compilerOptions"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.09
Nodes (37): WhatsAppConnectionController, assertShopAccess(), ShopWhatsAppDto, ShopWhatsAppStatus, inject, injectable, WhatsAppConnectionUseCase, requireOpenShopWhatsAppInstance() (+29 more)

### Community 9 - "AppError"
Cohesion: 0.06
Nodes (30): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+22 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.06
Nodes (35): GetLogoUploadUrlUseCase, IGetLogoUploadUrlDTO, IGetLogoUploadUrlResult, inject, injectable, ADMIN, otherOwner, ALLOWED_MIME_SET (+27 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.10
Nodes (17): ClientPackageController, resolveBarbershopId(), ServicePackageController, BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField (+9 more)

### Community 12 - "normalizeCpf"
Cohesion: 0.11
Nodes (12): AbacatePayService, injectable, ProratedRefundInput, ISubscribeDTO, makeFullSubscription(), makeSubscription(), NOW, prismaMock (+4 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.08
Nodes (34): AdminUserController, BlockedEntityAdminController, adminListBlockedEntitiesQuerySchema, BlockInput, blockSchema, UnblockInput, unblockSchema, logger (+26 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.10
Nodes (16): IBarbershopResponseDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO, BarbershopRepository, MockBarbershopRepository, ScheduleItem, IBarbershopRepository, CreateBarbershopUseCase (+8 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.09
Nodes (41): ChargeTrialEndedSubscriptionsUseCase, injectable, getProcessRole(), ProcessRole, shouldRunApi(), shouldRunCrons(), shouldRunWorkers(), VALID_ROLES (+33 more)

### Community 16 - "IAppointmentResponseDTO"
Cohesion: 0.05
Nodes (37): ./*, config/*, dist, dtos/*, ES2022, libs/*, modules/*, node_modules (+29 more)

### Community 17 - "auth.routes.ts"
Cohesion: 0.18
Nodes (6): MercadoPagoService, injectable, CreateCardPaymentUseCase, inject, injectable, inject

### Community 18 - "MercadoPagoService"
Cohesion: 0.11
Nodes (12): GetBarbershopController, GetBarbershopUseCase, inject, injectable, ListPublicStaffUseCase, inject, injectable, ListBarbershopsController (+4 more)

### Community 19 - "IUserResponseDTO"
Cohesion: 0.18
Nodes (5): IPaymentResponseDTO, MockPaymentRepository, mapToDTO(), PaymentRepository, IUpdatePaymentStatusDTO

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.07
Nodes (29): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentRepository, AppointmentWithRelations (+21 more)

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.05
Nodes (36): sensitiveRoutes, adapter, pool, prisma, EnrichedBarbershop, ExpenseRow, FiadoRow, FiadoSummaryRow (+28 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.25
Nodes (4): ProcessWebhookController, ProcessWebhookUseCase, inject, injectable

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.07
Nodes (20): AppointmentController, availabilityQuerySchema, createAppointmentSchema, ADMIN, otherOwner, CancelAppointmentUseCase, CreateAppointmentUseCase, CreatePublicAppointmentUseCase (+12 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.43
Nodes (5): AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.12
Nodes (10): AdminAuditLogController, AdminNotificationController, AdminReferralsController, auditLogController, barbershopController, blockedEntityController, dashboardController, notificationController (+2 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.10
Nodes (20): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, TOPIC_LABEL (+12 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.12
Nodes (29): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DEFAULT_PROVIDER_ORDER (+21 more)

### Community 28 - "IQueueRepository"
Cohesion: 0.09
Nodes (26): assertPaymentProviderEnabled(), EnabledPaymentProvider, enabledPaymentProviders(), IInvoiceResponseDTO, ISubscriptionResponseDTO, SubscriptionStatus, CancellationContextController, CancellationContextResult (+18 more)

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.39
Nodes (4): blockOwnerCpfs(), SUBSCRIPTION_STATUS_CONFIG, shouldBlockOwnerCpfsOnDeniedAccess(), subscriptionGrantsAccess()

### Community 30 - "queue.spec.ts"
Cohesion: 0.21
Nodes (9): issueAuthSession(), mapRole(), UserLike, UserLike, logger, UserLike, UserWithEmailPassword, mapRole() (+1 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.13
Nodes (11): createBarbershopSchema, phoneBR, scheduleItemSchema, updateBarbershopSchema, updateScheduleSchema, CreateBarbershopController, UpdateBarbershopController, UpdateScheduleController (+3 more)

### Community 32 - "emailWorker.ts"
Cohesion: 0.12
Nodes (11): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+3 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.06
Nodes (30): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository (+22 more)

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.14
Nodes (3): IQueueItemResponseDTO, MockQueueRepository, QueueRepository

### Community 35 - "monitor-routes.js"
Cohesion: 0.06
Nodes (33): GoogleLoginUseCase, mockFindByEmail, mockUser, mockVerifyIdToken, prismaMock, inject, injectable, inject (+25 more)

### Community 36 - "scripts"
Cohesion: 0.08
Nodes (25): scripts, build, db:push, db:push:prod, db:studio, dev, dev:docker, prisma:generate (+17 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.10
Nodes (6): AsaasService, injectable, GetPaymentStatusController, GetPaymentStatusUseCase, inject, injectable

### Community 38 - "index.ts"
Cohesion: 0.16
Nodes (15): setupSwagger(), buildApp(), checkDatabase(), checkRedis(), healthRoutes(), correlationIdMiddleware(), registerRoutes(), AUDIT_VALUE_ALLOWLIST (+7 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.52
Nodes (6): getNotificationV2Mode(), dispatchBatch(), dispatchNotificationOutboxNow(), logger, nextBackoff(), startNotificationDispatcher()

### Community 40 - "appointmentUseCases.ts"
Cohesion: 0.12
Nodes (24): buildQueueCalledMessage(), buildQueueCancelledMessage(), buildQueueJoinedMessage(), logger, notifyCustomerJoinedQueue(), NotifyQueuePositionResult, NotifyQueuePositionUpdatesUseCase, injectable (+16 more)

### Community 41 - "payments.spec.ts"
Cohesion: 0.38
Nodes (3): ExportUserDataController, ExportUserDataUseCase, injectable

### Community 42 - "IQueueItemResponseDTO"
Cohesion: 0.08
Nodes (23): 💈 AgendAI — Backend API, Autenticação, Com Docker (recomendado), Como Rodar, Configuração do Ambiente, Documentação Swagger, Estrutura do Projeto, Fluxo de assinatura (+15 more)

### Community 43 - "assertAppointmentBookable.ts"
Cohesion: 0.12
Nodes (16): Admin — Audit Logs, Admin — Dashboard, Auth, `GET /admin/audit-logs` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/dashboard`, `GET /auth/me` 🔒, `GET /health`, `GET /plans` (+8 more)

### Community 44 - "referralService.ts"
Cohesion: 0.17
Nodes (17): ReferralsController, applyReferralCode(), ensureReferralCode(), generateCode(), getReferralDashboard(), logger, qualifyReferralOnPayment(), tierLabel() (+9 more)

### Community 45 - "index.ts"
Cohesion: 0.33
Nodes (4): DeleteQueueItemController, DeleteQueueItemUseCase, inject, injectable

### Community 46 - ".findById"
Cohesion: 0.14
Nodes (19): IBillingAddressDTO, ICardPayerDTO, ICreateCardPaymentDTO, ICreatePixPaymentDTO, IMercadoPagoWebhookDTO, IPixQrCodeDTO, PaymentMethod, PaymentProvider (+11 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.12
Nodes (14): AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput, allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody (+6 more)

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.09
Nodes (14): CancelPaymentController, CancelPaymentUseCase, inject, injectable, ListPaymentsUseCase, inject, injectable, abacateServiceMock (+6 more)

### Community 49 - "devDependencies"
Cohesion: 0.13
Nodes (25): broadcastPostToClients(), agendaiWordmark(), badge(), buildPostSvg(), escapeXml(), formatBRL(), hoursCard(), LayoutCtx (+17 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.15
Nodes (7): RequestingUser, classifyMaturity(), confidenceInterval(), DemandPredictor, walkForwardBacktest(), WeatherDataPoint, WeatherForecastPoint

### Community 51 - "server.ts"
Cohesion: 0.17
Nodes (21): VerifyEmailController, VerifyEmailUseCase, apiUrl(), buildForgotPasswordEmail(), buildVerifyEmail(), escapeHtml(), emailLayout(), frontendUrl() (+13 more)

### Community 52 - "QueueRepository"
Cohesion: 0.10
Nodes (21): IBookPackageSlotDTO, ICreateServicePackageDTO, ISellClientPackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map() (+13 more)

### Community 53 - "GcsStorageProvider"
Cohesion: 0.09
Nodes (21): AgendAI Back‑end — Manual do Sistema, Autenticação e Autorização, Banco de Dados (Prisma), Com Docker, Como Adicionar um Novo Caso de Uso/Endpoint, Convenções, Definições, Dicas para IA (+13 more)

### Community 54 - "9. Como Criar um Novo Módulo"
Cohesion: 0.22
Nodes (14): CreateAppointmentInput, dateField, listAppointmentsQuerySchema, phoneBR, timeField, UpdateAppointmentInput, updateAppointmentSchema, addMinutes() (+6 more)

### Community 55 - "Barbearias"
Cohesion: 0.08
Nodes (13): ConfirmLogoUseCase, inject, injectable, DeleteLogoUseCase, inject, injectable, LogoController, inject (+5 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.11
Nodes (22): ENUM_TO_INPUT, logger, PostRow, postSelect, createPostSchema, designOptionsSchema, generatePostSchema, getConfigQuerySchema (+14 more)

### Community 59 - "IAppointmentRepository"
Cohesion: 0.50
Nodes (4): Admin — Assinaturas, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions` 🔒 🛡️ `MASTER_ADMIN`

### Community 60 - "GetQueueMetricsUseCase"
Cohesion: 0.20
Nodes (10): ALLOWED_MIME_SET, logger, UploadVideoController, IUploadVideoDTO, IUploadVideoResult, inject, injectable, UploadVideoUseCase (+2 more)

### Community 61 - "🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI"
Cohesion: 0.23
Nodes (8): IJoinQueueDTO, QueueStatus, IUpdateQueueItemDTO, PrismaQueueStatus, toDTO(), toPrisma(), QueueWaitEstimate, computeIdentityKey()

### Community 62 - "Categorias"
Cohesion: 0.17
Nodes (11): 1. Preparação, 2. Pré-validação, 3. Aplicação, 4. Pós-validação, Escala horizontal, Estado conhecido, Falhas e recuperação, Fluxo de deploy (+3 more)

### Community 63 - "app.ts"
Cohesion: 0.12
Nodes (17): dotenv-cli, devDependencies, dotenv-cli, prisma, @testcontainers/postgresql, @types/node, @types/node-cron, @types/pg (+9 more)

### Community 64 - "ListBarbershopsUseCase.ts"
Cohesion: 0.15
Nodes (13): AdminBarbershopController, adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema, adminUpdateUserSchema (+5 more)

### Community 65 - "ListQueueController.ts"
Cohesion: 0.29
Nodes (3): debitClientPackageInTx(), restoreClientPackageInTx(), Tx

### Community 66 - "Google Cloud Storage — setup AgendAI"
Cohesion: 0.50
Nodes (4): Admin — Planos, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/plans` 🔒 🛡️ `MASTER_ADMIN`

### Community 67 - "13. Regras de Negócio Críticas"
Cohesion: 0.29
Nodes (8): ADMIN, futureDate, owner(), seedClientAndPackage(), batchSlotsOverlap(), IBatchSlot, overlaps(), timeToMinutes()

### Community 68 - "Fiado"
Cohesion: 0.14
Nodes (10): DemandPrediction, FEATURE_NAMES, MaturityLevel, RECOMMENDATIONS, TreeNode, TreeOptions, SeasonalDecomposition, correlation() (+2 more)

### Community 69 - "GetBarbershopUseCase.ts"
Cohesion: 0.21
Nodes (11): EmailTemplateId, emailDestination(), EmailJobData, emailNotificationType(), emailQueue, emailQueueEvents, enqueueLegacy(), getEvents() (+3 more)

### Community 71 - "PlansController.ts"
Cohesion: 0.28
Nodes (7): IEmailProvider, SendEmailInput, SendEmailResult, logger, ResendEmailProvider, injectable, MockEmailProvider

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.50
Nodes (4): Assinaturas, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `GET /subscriptions/me` 🔒, `POST /subscriptions` 🔒 🛡️ `MASTER_ADMIN, OWNER`

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.20
Nodes (11): ExpenseRow, ExpenseWithCategory, FiadoRow, FiadoWithPayments, BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod, normalizeWhatsapp() (+3 more)

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.26
Nodes (7): assertSameBarbershop(), assertShopWhatsAppConnected(), buildPostImage(), defaultCtaText(), loadPostContext(), PostsController, toPostResponse()

### Community 75 - "dependencies"
Cohesion: 0.11
Nodes (6): IQueueRepository, GetQueueMetricsController, GetQueueMetricsUseCase, inject, injectable, inject

### Community 76 - "Passo a passo"
Cohesion: 0.08
Nodes (32): getNotificationOperationsHealth(), heartbeatStatus(), logger, RedisRateLimitStore, getNotificationQueue(), enqueuePostBroadcast(), getEvents(), getQueue() (+24 more)

### Community 77 - "Despesas"
Cohesion: 0.07
Nodes (37): forgotPasswordSchema, googleLoginSchema, loginSchema, phoneBR, refreshSchema, registerSchema, resetPasswordSchema, scheduleItemSchema (+29 more)

### Community 78 - "Pagamentos"
Cohesion: 0.20
Nodes (7): PlansController, planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 80 - "7. Sistema de Assinaturas e Bloqueio de CPF"
Cohesion: 0.12
Nodes (14): IRegisterDTO, RegisterUseCase, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate (+6 more)

### Community 81 - "Apêndice B — Endpoints por Role"
Cohesion: 0.18
Nodes (11): buildCreateBody(), buildUpdateArgs(), CREATED_POST_ROW, fakeUser(), mockBarbershopFindUnique, mockBroadcast, mockFeedPostCreate, mockFeedPostFindUnique (+3 more)

### Community 82 - "Agendamentos"
Cohesion: 0.33
Nodes (6): CachedWeatherProvider, DEFAULT_CONDITION, OpenMeteoWeatherProvider, WMO_CODES, DailyForecast, IWeatherProvider

### Community 83 - "Fila (Queue)"
Cohesion: 0.24
Nodes (3): withCronLock(), DistributedLock, RedisDistributedLock

### Community 84 - "Serviços"
Cohesion: 0.20
Nodes (4): GetScheduleController, GetScheduleUseCase, inject, injectable

### Community 85 - "setup-gcs.sh"
Cohesion: 0.18
Nodes (11): 9. Como Criar um Novo Módulo, Passo 10 — Schema Prisma, Passo 1 — DTOs, Passo 2 — Interface do Repositório, Passo 3 — Mock Repository (para testes), Passo 4 — Implementação Prisma, Passo 5 — Schemas Zod, Passo 6 — UseCases (+3 more)

### Community 86 - "VerifyEmailController.ts"
Cohesion: 0.18
Nodes (11): bullmq, @fastify/swagger-ui, google-auth-library, ioredis, @opentelemetry/exporter-prometheus, dependencies, bullmq, @fastify/swagger-ui (+3 more)

### Community 87 - "PlansController"
Cohesion: 0.18
Nodes (10): Achados e correções aplicadas neste ciclo, Casos executáveis (inclusos no plano), Casos manuais → automatizados, Controles validados (sem achado novo), Inventário Graphify, Limitações, PENTEST-AUTH-001 — Authorization sem validação de scheme `Bearer` (corrigido), PENTEST-AUTH-002 — Refresh JWT sem `jti` podia colidir no mesmo segundo (corrigido) (+2 more)

### Community 88 - "StaffUserController"
Cohesion: 0.18
Nodes (11): Barbearias, `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`, Logo — Fluxo via Signed URL (recomendado para produção), Logo — Upload Direto via Multipart (mais simples) (+3 more)

### Community 90 - "14. Integrações Externas"
Cohesion: 0.20
Nodes (10): 12. Erros Comuns e Como Evitá-los, ❌ Converter BigInt para Number, ❌ Esquecer de registrar o repositório no container, ❌ Esquecer `reflect-metadata` no setup de testes, ❌ Importar tipos Prisma do pacote diretamente, ❌ Instanciar Prisma fora de `prismaClient.ts`, ❌ Não registrar rota no `api.ts`, ❌ Passar string de token JWT diretamente em `expiresIn` (+2 more)

### Community 91 - "5. Convenções de Código"
Cohesion: 0.22
Nodes (8): args, base, once, probe(), run(), serviceId, shopId, token

### Community 94 - "Admin — Usuários"
Cohesion: 0.20
Nodes (4): BarbershopFinancialController, GetWeatherInsightsUseCase, inject, injectable

### Community 95 - "seed-test.js"
Cohesion: 0.24
Nodes (4): DeleteBarbershopController, DeleteBarbershopUseCase, inject, injectable

### Community 96 - "postgres.ts"
Cohesion: 0.24
Nodes (5): updateQueueItemSchema, UpdateQueueItemController, inject, injectable, UpdateQueueItemUseCase

### Community 98 - "Admin — Assinaturas"
Cohesion: 0.22
Nodes (9): 10. Como Criar um Novo Endpoint, 15. Checklist antes de Finalizar uma Tarefa, 1. Visão Geral do Projeto, 2. Stack e Versões, 4. Estrutura de Pastas, 🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI, Apêndice A — Mapa de Tokens de Injeção, Exemplo completo — `GET /reviews` (+1 more)

### Community 99 - "Admin — Barbearias"
Cohesion: 0.22
Nodes (9): Categorias, `DELETE /expense-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /service-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `GET /expense-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /service-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /expense-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `PATCH /service-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `POST /expense-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋 (+1 more)

### Community 100 - "Admin — Planos"
Cohesion: 0.09
Nodes (39): findExisting(), NotificationPayload, NotificationV2Mode, resolveSkipReason(), scheduleNotification(), ScheduleNotificationInput, uniqueKey(), canOwnerConfigureNotification() (+31 more)

### Community 101 - "Assinaturas"
Cohesion: 0.22
Nodes (5): DailyLimitExceededError, GeneratePostInput, baseInput, mockRedisGet, mockRedisSet

### Community 102 - "Auth"
Cohesion: 0.28
Nodes (5): ListQueueController, toPublicView(), ListQueueUseCase, inject, injectable

### Community 103 - "Financeiro da Barbearia"
Cohesion: 0.13
Nodes (11): LoginUseCase, injectable, ProfileController, inject, injectable, DeleteAccountController, validateDeleteAccount(), DeleteAccountUseCase (+3 more)

### Community 104 - "fastify.d.ts"
Cohesion: 0.22
Nodes (8): mockBarbershopFindMany, mockBarbershopUpdate, mockBroadcast, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostUpdate, mockScheduleFindFirst, mockServiceFindMany

### Community 105 - "bcryptjs"
Cohesion: 0.25
Nodes (6): Alternativa: `GCS_CREDENTIALS_JSON`, Google Cloud Storage — setup AgendAI, Produção (Cloud Run / GKE), Pré-requisitos, Rotação de chave, Scripts relacionados

### Community 106 - "busboy"
Cohesion: 0.25
Nodes (8): 13.1 Fila (Queue), 13.2 Fiado, 13.3 Agendamentos, 13.4 Usuários, 13.5 Barbearias, 13.6 Pagamentos, 13.7 CPF no JWT, 13. Regras de Negócio Críticas

### Community 107 - "dayjs"
Cohesion: 0.20
Nodes (9): Alertas mínimos, Ativação do ledger de notificações, Auditoria de dados sensíveis, Backup, restauração e rollback, Gate de lançamento, Operação do MVP público, Smoke comportamental, Staging isolado (+1 more)

### Community 108 - "disposable-email-domains"
Cohesion: 0.25
Nodes (7): Achados confirmados, Controles validados, Evidência de mapeamento, Limitações e próximas verificações, PENTEST-INPUT-001 — URLs de imagem do feed sem esquema permitido, PENTEST-INPUT-002 — conteúdo HTML do feed é armazenado sem sanitização de domínio, Pentest local — inputs, upload, XSS e exposição pública

### Community 109 - "@fastify/cors"
Cohesion: 0.25
Nodes (8): `DELETE /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, Fiado, `GET /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /fiado` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /fiado/summary` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /fiado/:id/payments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /fiado` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋

### Community 111 - "@fastify/multipart"
Cohesion: 0.32
Nodes (7): applyTransition(), getNextStatus(), isValidTransition(), SubscriptionEvent, SubscriptionStatus, TRANSITION_TABLE, TRANSITIONS

### Community 112 - "@fastify/rate-limit"
Cohesion: 0.29
Nodes (7): 6.1 Middlewares disponíveis, 6.2 Combinação padrão de preHandler, 6.3 Roles e permissões, 6.4 Acesso ao usuário no request, 6.5 Autorização em UseCases, 6.6 Token JWT, 6. Sistema de Autenticação e Autorização

### Community 113 - "@fastify/swagger"
Cohesion: 0.29
Nodes (7): 8.1 Instância do Prisma, 8.2 UUIDs, 8.3 Soft delete vs hard delete, 8.4 Enum mapping, 8.5 Migrations vs db push, 8.6 BigInt, 8. Banco de Dados e Prisma

### Community 114 - "@fastify/swagger-ui"
Cohesion: 0.29
Nodes (7): 1. Projeto GCP, 2. Variáveis no `.env`, 3. Criar Service Account + chave JSON, 4. Bucket, CORS, IAM público e pastas, 5. Rodar a API, 6. Smoke test, Passo a passo

### Community 115 - "@google-cloud/storage"
Cohesion: 0.29
Nodes (6): Achado estático (corrigido), Ambiente isolado, Casos executáveis incluídos, Casos manuais (agora automatizados em `src/tests/pentest/`), Inventário assistido por Graphify, Pentest local autorizado

### Community 116 - "ioredis"
Cohesion: 0.29
Nodes (7): `DELETE /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, Despesas, `GET /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /expenses` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /expenses/summary` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /expenses` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋

### Community 117 - "jsonwebtoken"
Cohesion: 0.29
Nodes (7): `GET /payments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE`, `GET /payments` 🔒 🛡️ `MASTER_ADMIN, OWNER`, Pagamentos, `PATCH /payments/:id/cancel` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `POST /payments/card` 🔒, `POST /payments/pix` 🔒, `POST /payments/webhook`

### Community 118 - "ProcessAbacateWebhookController.ts"
Cohesion: 0.29
Nodes (4): abacateMock, asaasMock, mpMock, prismaMock

### Community 119 - "node-cron"
Cohesion: 0.33
Nodes (6): 3.1 Clean Architecture (simplificada), 3.2 Padrão por módulo, 3.3 Injeção de Dependências, 3.4 Tratamento de Erros, 3.5 Resposta HTTP padrão, 3. Arquitetura e Padrões

### Community 120 - "CreateUserUseCase.ts"
Cohesion: 0.33
Nodes (6): 7.1 Fluxo de acesso, 7.2 Status de Subscription, 7.3 Resposta 402 padronizada, 7.4 Bloqueio automático de CPF, 7.5 Serviço de bloqueio, 7. Sistema de Assinaturas e Bloqueio de CPF

### Community 121 - "@prisma/client"
Cohesion: 0.33
Nodes (6): Apêndice B — Endpoints por Role, MASTER_ADMIN only, OWNER + EMPLOYEE + MASTER_ADMIN, OWNER + MASTER_ADMIN, OWNER only, Público (sem autenticação)

### Community 122 - "reflect-metadata"
Cohesion: 0.33
Nodes (6): Agendamentos, `DELETE /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `GET /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /appointments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /appointments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋

### Community 123 - "resend"
Cohesion: 0.33
Nodes (6): Como obter o token JWT para o monitor, Interpretação dos status, Monitor de Rotas em Tempo Real, O que o monitor exibe, Requisitos do monitor, Uso básico

### Community 124 - "@resvg/resvg-js"
Cohesion: 0.33
Nodes (6): `DELETE /queue/:id` 🔒 📋, Fila (Queue), `GET /queue` 🔒 📋, `GET /queue/metrics`, `PATCH /queue/:id` 🔒 📋, `POST /queue`

### Community 125 - "tsconfig-paths"
Cohesion: 0.33
Nodes (6): `DELETE /services/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `GET /services`, `GET /services/:id`, `POST /services` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `PUT /services/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, Serviços

### Community 126 - "tsyringe"
Cohesion: 0.60
Nodes (5): err(), info(), ok(), setup-gcs.sh script, warn()

### Community 127 - "zod"
Cohesion: 0.40
Nodes (3): insideRlsTx, rlsExtension, RequestContext

### Community 128 - "tsup"
Cohesion: 0.33
Nodes (3): mockEnqueue, mockFindMany, mockFindUnique

### Community 130 - "@types/bcryptjs"
Cohesion: 0.40
Nodes (5): 11.1 Configuração, 11.2 Padrão de teste, 11.3 Executar testes, 11.4 O que deve ser testado, 11. Testes

### Community 131 - "@types/node"
Cohesion: 0.40
Nodes (5): 14.0 E-mail (Resend) + Indicação, 14.1 Mercado Pago, 14.2 Google Cloud Storage, 14.3 Variáveis de Ambiente Obrigatórias em Produção, 14. Integrações Externas

### Community 132 - "@types/node-cron"
Cohesion: 0.40
Nodes (5): 5.1 Importações, 5.2 Nomenclatura, 5.3 Tipos, 5.4 Async/Await, 5. Convenções de Código

### Community 133 - "authSchemas.ts"
Cohesion: 0.40
Nodes (5): Admin — Entidades Bloqueadas, `DELETE /admin/blocked-entities/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/blocked-entities/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/blocked-entities` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/blocked-entities` 🔒 🛡️ `MASTER_ADMIN`

### Community 134 - "vite-tsconfig-paths"
Cohesion: 0.40
Nodes (5): Admin — Notificações, `GET /admin/notifications` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/notifications/unread-count` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/notifications/:id/read` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/notifications/read-all` 🔒 🛡️ `MASTER_ADMIN`

### Community 135 - "vitest"
Cohesion: 0.40
Nodes (5): Admin — Usuários, `DELETE /admin/users/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/users` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/users/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/users` 🔒 🛡️ `MASTER_ADMIN`

### Community 136 - "ensure-gcs-key.sh"
Cohesion: 0.40
Nodes (3): prisma, { PrismaClient }, { randomUUID }

### Community 138 - "disposable-email-domains.d.ts"
Cohesion: 0.50
Nodes (3): main, name, version

### Community 139 - "setup.ts"
Cohesion: 0.50
Nodes (4): Admin — Barbearias, `GET /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/barbershops/:id/status` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`

### Community 140 - "vitest.config.mts"
Cohesion: 0.50
Nodes (4): Admin — Financeiro, `GET /admin/financial/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/overview` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/summary` 🔒 🛡️ `MASTER_ADMIN`

### Community 142 - "GoogleLoginUseCase"
Cohesion: 0.50
Nodes (4): Financeiro da Barbearia, `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋

### Community 145 - "sendWhatsAppMessage"
Cohesion: 0.23
Nodes (12): refreshCrmCampaignStatus(), prismaMock, loadNotificationPayload(), NotificationJobData, claimAttempt(), completeAttempt(), createWorker(), failAttempt() (+4 more)

### Community 200 - "CompleteServiceUseCase.ts"
Cohesion: 0.20
Nodes (11): backfillCrmLedger(), EventInput, recordCrmFinancialEvent(), recordFiadoCreated(), recordFiadoPayment(), recordPackageSale(), recordQueueCompletion(), runCrmBackfill() (+3 more)

### Community 201 - "authenticate.ts"
Cohesion: 0.12
Nodes (11): AuthConfig, ListPaymentsController, abacateWebhookPreParsing(), ListRefundsController, extractBearerToken(), JwtPayload, JwtPayload, checkoutRateLimit (+3 more)

### Community 202 - "assertOperationEnabled.ts"
Cohesion: 0.16
Nodes (14): OperationMode, ChangeOperationModeController, ChangeOperationModeDTO, ChangeOperationModeResult, ChangeOperationModeUseCase, inject, injectable, assertOperationEnabled() (+6 more)

### Community 203 - "index.ts"
Cohesion: 0.12
Nodes (13): CommissionController, ICommissionEntryDTO, ICommissionSplitDTO, ICommissionSummary, IListCommissionsQuery, CommissionRepository, CommissionWithRelations, dateFilter() (+5 more)

### Community 206 - "ProcessAsaasWebhookUseCase.ts"
Cohesion: 0.15
Nodes (8): allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessAsaasWebhookUseCase, injectable, handleSubscriptionPaymentWebhook(), prismaMock

### Community 208 - "resendWebhookService.ts"
Cohesion: 0.15
Nodes (18): header(), RawBodyRequest, ResendWebhookController, resendWebhookPreParsing(), recordTerminalNotificationFailure(), sanitizeNotificationError(), addSuppression(), applyEmailEvent() (+10 more)

### Community 211 - "IPaymentRepository"
Cohesion: 0.16
Nodes (7): IPaymentRepository, CreatePixPaymentUseCase, inject, injectable, inject, inject, inject

### Community 213 - "queueDuplicate.ts"
Cohesion: 0.21
Nodes (9): JoinQueueController, JoinQueueUseCase, inject, injectable, isQueueStaffForShop(), digits(), isActiveQueueDuplicate(), normalizeName() (+1 more)

### Community 216 - "CheckInAppointmentUseCase.ts"
Cohesion: 0.22
Nodes (7): CheckInAppointmentController, checkInSchema, CheckInAppointmentUseCase, ICheckInDTO, ICheckInResult, logger, injectable

### Community 218 - "onboarding.routes.ts"
Cohesion: 0.32
Nodes (5): onboardingRoutes(), GetOnboardingUseCase, injectable, injectable, UpdateOnboardingStepUseCase

### Community 220 - "ResetPasswordUseCase"
Cohesion: 0.40
Nodes (3): ResetPasswordUseCase, inject, injectable

### Community 221 - "notifications.routes.ts"
Cohesion: 0.38
Nodes (6): retryNotification(), listSchema, notificationsRoutes(), ownerShop(), preferencesSchema, whatsappBodySchema

### Community 223 - "seed.ts"
Cohesion: 0.22
Nodes (5): adapter, defaultPlans, pool, prisma, BcryptHashProvider

## Knowledge Gaps
- **773 isolated node(s):** `docker-entrypoint.sh script`, `args`, `base`, `token`, `shopId` (+768 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **62 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `IPaymentDTO.ts` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `IBarbershopRepository`, `AppError`, `💈 AgendAI — Backend API`, `IBarbershopResponseDTO`, `IStorageProvider`, `appointments.spec.ts`, `RegisterUseCase.ts`, `SubscribeUseCase.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `emailWorker.ts`, `IPaymentRepository`, `monitor-routes.js`, `index.ts`, `appointmentUseCases.ts`, `referralService.ts`, `index.ts`, `.findById`, `ContactController.ts`, `IEmailProvider.ts`, `CreateBarbershopUseCase`, `QueueRepository`, `12. Erros Comuns e Como Evitá-los`, `GetQueueMetricsUseCase`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `ListBarbershopsUseCase.ts`, `ListQueueController.ts`, `13. Regras de Negócio Críticas`, `CompleteServiceUseCase.ts`, `6. Sistema de Autenticação e Autorização`, `assertOperationEnabled.ts`, `index.ts`, `authenticate.ts`, `Despesas`, `Pagamentos`, `CheckInAppointmentUseCase.ts`, `notifications.routes.ts`, `postgres.ts`, `Admin — Planos`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `prisma` connect `IPaymentDTO.ts` to `api.ts`, `IFiadoResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `AppError`, `💈 AgendAI — Backend API`, `IStorageProvider`, `appointments.spec.ts`, `IPlanResponseDTO`, `sendWhatsAppMessage`, `RegisterUseCase.ts`, `AgendAI Back‑end — Manual do Sistema`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `emailWorker.ts`, `IPaymentRepository`, `monitor-routes.js`, `index.ts`, `Referência Completa de Rotas`, `referralService.ts`, `.findById`, `devDependencies`, `CreateBarbershopUseCase`, `QueueRepository`, `12. Erros Comuns e Como Evitá-los`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `ListBarbershopsUseCase.ts`, `PlansController.ts`, `CompleteServiceUseCase.ts`, `6. Sistema de Autenticação e Autorização`, `assertOperationEnabled.ts`, `index.ts`, `Passo a passo`, `Despesas`, `Pagamentos`, `resendWebhookService.ts`, `queueDuplicate.ts`, `CheckInAppointmentUseCase.ts`, `notifications.routes.ts`, `Admin — Planos`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `GcsStorageProvider` connect `3. Arquitetura e Padrões` to `Agendamentos`, `💈 AgendAI — Backend API`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 24 inferred relationships involving `authenticate()` (e.g. with `onboardingRoutes()` and `adminRoutes()`) actually correct?**
  _`authenticate()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `setRlsContext()` (e.g. with `onboardingRoutes()` and `adminRoutes()`) actually correct?**
  _`setRlsContext()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `args`, `base` to the rest of the system?**
  _773 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IFiadoResponseDTO` be split into smaller, more focused modules?**
  _Cohesion score 0.05757286192068801 - nodes in this community are weakly interconnected._