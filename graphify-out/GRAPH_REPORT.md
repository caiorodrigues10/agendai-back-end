# Graph Report - agendai-back-end  (2026-09-02)

## Corpus Check
- 483 files · ~161,965 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3129 nodes · 7370 edges · 200 communities (141 shown, 59 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 206 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `70715312`
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
- setup.ts
- vitest.config.mts
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

## God Nodes (most connected - your core abstractions)
1. `AppError` - 129 edges
2. `prisma` - 98 edges
3. `authenticate()` - 53 edges
4. `IBarbershopRepository` - 52 edges
5. `setRlsContext()` - 47 edges
6. `authorize()` - 46 edges
7. `checkSubscription()` - 44 edges
8. `IPaymentResponseDTO` - 41 edges
9. `IQueueItemResponseDTO` - 37 edges
10. `getRedisConnection()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `scheduleAppointmentReminders()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/cron/appointmentReminders.cron.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `notificationsRoutes()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/http/routes/notifications.routes.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `buildApp()` --indirect_call--> `apiRoutes()`  [INFERRED]
  src/shared/infra/http/app.ts → src/shared/infra/http/routes/api.ts
- `buildAuthProbeApp()` --indirect_call--> `authenticate()`  [INFERRED]
  src/tests/pentest/auth-session.pentest.spec.ts → src/shared/infra/http/middlewares/authenticate.ts
- `authRoutes()` --indirect_call--> `verifyRecaptcha()`  [INFERRED]
  src/shared/infra/http/routes/auth.routes.ts → src/shared/infra/http/middlewares/verifyRecaptcha.ts

## Import Cycles
- None detected.

## Communities (200 total, 59 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.06
Nodes (77): AuthConfig, googleLoginSchema, ForgotPasswordController, validateForgotPassword, validateGoogleLogin, mapRole(), MeController, mePreHandler() (+69 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.05
Nodes (47): backfillCrmLedger(), EventInput, recordCrmFinancialEvent(), recordFiadoCreated(), recordFiadoPayment(), recordPackageSale(), recordQueueCompletion(), runCrmBackfill() (+39 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.05
Nodes (34): CommissionController, ICommissionEntryDTO, ICommissionSplitDTO, ICommissionSummary, IListCommissionsQuery, CommissionRepository, CommissionWithRelations, dateFilter() (+26 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.06
Nodes (40): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+32 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.06
Nodes (32): CrmController, resolveCampaignClientIds(), resolveShop(), CrmCampaignListItem, CrmClientMetrics, CrmForecastDTO, CrmOverviewDTO, CrmSegment (+24 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.06
Nodes (28): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, createServiceSchema, updateServiceSchema (+20 more)

### Community 6 - "index.ts"
Cohesion: 0.06
Nodes (47): AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput, AsaasBillingType, AsaasCustomer, AsaasPayment (+39 more)

### Community 7 - "compilerOptions"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.10
Nodes (34): WhatsAppConnectionController, assertShopAccess(), ShopWhatsAppDto, ShopWhatsAppStatus, inject, injectable, WhatsAppConnectionUseCase, requireOpenShopWhatsAppInstance() (+26 more)

### Community 9 - "AppError"
Cohesion: 0.07
Nodes (30): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+22 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.08
Nodes (22): IGetLogoUploadUrlDTO, IGetLogoUploadUrlResult, ADMIN, otherOwner, IUploadLogoDirectDTO, ALLOWED_MIME_SET, AvatarController, confirmAvatarSchema (+14 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.08
Nodes (24): ClientPackageController, resolveBarbershopId(), ServicePackageController, BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField (+16 more)

### Community 12 - "normalizeCpf"
Cohesion: 0.07
Nodes (10): AbacatePayService, injectable, AsaasService, injectable, CancelPaymentController, CancelPaymentUseCase, inject, injectable (+2 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.09
Nodes (27): AdminUserController, BlockedEntityAdminController, adminListBlockedEntitiesQuerySchema, BlockInput, blockSchema, UnblockInput, unblockSchema, forgotPasswordSchema (+19 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.14
Nodes (9): IBarbershopResponseDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO, BarbershopRepository, MockBarbershopRepository, ScheduleItem, IBarbershopRepository, IConfirmLogoDTO (+1 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.09
Nodes (30): ChargeTrialEndedSubscriptionsUseCase, injectable, getProcessRole(), ProcessRole, shouldRunApi(), shouldRunCrons(), shouldRunWorkers(), VALID_ROLES (+22 more)

### Community 16 - "IAppointmentResponseDTO"
Cohesion: 0.05
Nodes (37): ./*, config/*, dist, dtos/*, ES2022, libs/*, modules/*, node_modules (+29 more)

### Community 17 - "auth.routes.ts"
Cohesion: 0.10
Nodes (16): ICreateCardPaymentDTO, ICreatePixPaymentDTO, IPaymentRepository, MercadoPagoService, MPPaymentResponse, injectable, CreateCardPaymentUseCase, inject (+8 more)

### Community 18 - "MercadoPagoService"
Cohesion: 0.09
Nodes (18): CheckInAppointmentController, checkInSchema, CheckInAppointmentUseCase, ICheckInDTO, ICheckInResult, logger, injectable, GetBarbershopController (+10 more)

### Community 19 - "IUserResponseDTO"
Cohesion: 0.15
Nodes (14): IBillingAddressDTO, ICardPayerDTO, IPaymentResponseDTO, IPixQrCodeDTO, PaymentMethod, PaymentProvider, PaymentStatus, MockPaymentRepository (+6 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.14
Nodes (13): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentRepository, AppointmentWithRelations (+5 more)

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.09
Nodes (17): sensitiveRoutes, adapter, pool, prisma, ONBOARDING_STEPS, OnboardingStep, STEP_FIELDS, StepName (+9 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.11
Nodes (22): TOPIC_LABEL, logger, RedisRateLimitStore, EmailJobData, emailQueue, emailQueueEvents, getEvents(), getQueue() (+14 more)

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.09
Nodes (13): AppointmentController, ADMIN, otherOwner, CancelAppointmentUseCase, CreateAppointmentUseCase, CreatePublicAppointmentUseCase, GetAppointmentUseCase, GetAvailabilityUseCase (+5 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.08
Nodes (13): adapter, defaultPlans, pool, prisma, inject, ResetPasswordUseCase, inject, injectable (+5 more)

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.08
Nodes (16): AdminAuditLogController, AdminBarbershopController, AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period, AdminNotificationController (+8 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.10
Nodes (19): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, injectable (+11 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.12
Nodes (29): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DEFAULT_PROVIDER_ORDER (+21 more)

### Community 28 - "IQueueRepository"
Cohesion: 0.12
Nodes (19): CancellationContextController, CancellationContextResult, CancellationContextUseCase, emptyContext(), GetSubscriptionController, loadActivePlans(), SubscriptionEconomicsController, computePlanEconomics() (+11 more)

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.13
Nodes (18): refreshSchema, RefreshController, validateRefresh, logger, RegisterUseCase, injectable, attachReferralOnRegister(), buildSubscriptionRequiredError() (+10 more)

### Community 30 - "queue.spec.ts"
Cohesion: 0.10
Nodes (19): issueAuthSession(), mapRole(), UserLike, GoogleLoginController, GoogleLoginUseCase, mockFindByEmail, mockUser, mockVerifyIdToken (+11 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.09
Nodes (17): createBarbershopSchema, phoneBR, scheduleItemSchema, updateBarbershopSchema, updateScheduleSchema, CreateBarbershopController, CreateBarbershopUseCase, inject (+9 more)

### Community 32 - "emailWorker.ts"
Cohesion: 0.18
Nodes (9): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+1 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.18
Nodes (8): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.14
Nodes (3): IQueueItemResponseDTO, MockQueueRepository, QueueRepository

### Community 35 - "monitor-routes.js"
Cohesion: 0.17
Nodes (7): ICreateUserDTO, RoleLiteral, IUserResponseDTO, MockUserRepository, publicSelect, UserRepository, IUserRepository

### Community 36 - "scripts"
Cohesion: 0.08
Nodes (25): scripts, build, db:push, db:push:prod, db:studio, dev, dev:docker, prisma:generate (+17 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.15
Nodes (15): assertPaymentProviderEnabled(), EnabledPaymentProvider, enabledPaymentProviders(), IInvoiceResponseDTO, ISubscribeDTO, ISubscriptionResponseDTO, SubscriptionStatus, makeFullSubscription() (+7 more)

### Community 38 - "index.ts"
Cohesion: 0.15
Nodes (14): setupSwagger(), buildApp(), checkDatabase(), checkRedis(), healthRoutes(), correlationIdMiddleware(), registerRoutes(), AUDIT_VALUE_ALLOWLIST (+6 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.09
Nodes (15): DeleteLogoUseCase, inject, injectable, GetLogoUploadUrlUseCase, inject, injectable, ALLOWED_MIME_SET, confirmLogoSchema (+7 more)

### Community 40 - "appointmentUseCases.ts"
Cohesion: 0.15
Nodes (19): JoinQueueController, JoinQueueUseCase, injectable, buildQueueJoinedMessage(), logger, notifyCustomerJoinedQueue(), NotifyQueuePositionResult, masterAdmin (+11 more)

### Community 41 - "payments.spec.ts"
Cohesion: 0.10
Nodes (19): publicSelect, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, EmployeePermission, RoleLiteral, cpfSchema, CreateUserDTO, createUserSchema (+11 more)

### Community 42 - "IQueueItemResponseDTO"
Cohesion: 0.08
Nodes (23): 💈 AgendAI — Backend API, Autenticação, Com Docker (recomendado), Como Rodar, Configuração do Ambiente, Documentação Swagger, Estrutura do Projeto, Fluxo de assinatura (+15 more)

### Community 43 - "assertAppointmentBookable.ts"
Cohesion: 0.08
Nodes (24): Admin — Assinaturas, Admin — Audit Logs, Admin — Dashboard, Admin — Planos, Assinaturas, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER` (+16 more)

### Community 44 - "referralService.ts"
Cohesion: 0.17
Nodes (16): ReferralsController, applyReferralCode(), ensureReferralCode(), generateCode(), getReferralDashboard(), logger, tierLabel(), GetMyReferralsUseCase (+8 more)

### Community 45 - "index.ts"
Cohesion: 0.15
Nodes (11): buildQueueCalledMessage(), buildQueueCancelledMessage(), CommissionSplit, computeInsertJoinedAt(), ALLOWED_TRANSITIONS, assertQueueStatusTransition(), assertQueueTenantAccess(), logger (+3 more)

### Community 46 - ".findById"
Cohesion: 0.13
Nodes (10): IMercadoPagoWebhookDTO, allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessWebhookController, webhookBodySchema, logger (+2 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.17
Nodes (9): allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody, timingSafeStringEqual(), allowDevModeWebhooks(), IAbacateWebhookPayload, ProcessAbacateWebhookUseCase, skipApiVerification() (+1 more)

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.09
Nodes (14): GetPaymentStatusController, GetPaymentStatusUseCase, inject, injectable, ListPaymentsUseCase, inject, injectable, abacateServiceMock (+6 more)

### Community 49 - "devDependencies"
Cohesion: 0.17
Nodes (19): broadcastPostToClients(), logger, agendaiWordmark(), buildPostSvg(), escapeXml(), formatBRL(), pngToDataUrl(), PostSvgInput (+11 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.14
Nodes (11): RequestingUser, classifyMaturity(), confidenceInterval(), DemandPrediction, DemandPredictor, FEATURE_NAMES, MaturityLevel, RECOMMENDATIONS (+3 more)

### Community 51 - "server.ts"
Cohesion: 0.24
Nodes (17): apiUrl(), buildVerifyEmail(), escapeHtml(), emailLayout(), frontendUrl(), buildReferralAppliedEmail(), buildReferralConvertedEmail(), buildReferralRevokedEmail() (+9 more)

### Community 52 - "QueueRepository"
Cohesion: 0.22
Nodes (8): ICreateServicePackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map(), ServicePackageRepository, IServicePackageRepository

### Community 53 - "GcsStorageProvider"
Cohesion: 0.09
Nodes (21): AgendAI Back‑end — Manual do Sistema, Autenticação e Autorização, Banco de Dados (Prisma), Com Docker, Como Adicionar um Novo Caso de Uso/Endpoint, Convenções, Definições, Dicas para IA (+13 more)

### Community 54 - "9. Como Criar um Novo Módulo"
Cohesion: 0.19
Nodes (16): availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR, timeField, UpdateAppointmentInput (+8 more)

### Community 55 - "Barbearias"
Cohesion: 0.14
Nodes (6): ConfirmLogoUseCase, inject, injectable, ConfirmAvatarUseCase, inject, injectable

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.16
Nodes (17): ENUM_TO_INPUT, logger, PostRow, postSelect, createPostSchema, generatePostSchema, getConfigQuerySchema, listScheduledQuerySchema (+9 more)

### Community 58 - "AdminDashboardController.ts"
Cohesion: 0.14
Nodes (6): IQueueRepository, GetQueueMetricsController, GetQueueMetricsUseCase, inject, injectable, inject

### Community 59 - "IAppointmentRepository"
Cohesion: 0.17
Nodes (10): buildQueueUpdateMessage(), calendarDateParts(), createAppointmentAtomic(), formatSaoPauloTime(), mapCreatedAppointment(), ReminderResult, scheduledInstant(), debitClientPackageInTx() (+2 more)

### Community 60 - "GetQueueMetricsUseCase"
Cohesion: 0.18
Nodes (12): ALLOWED_MIME_SET, logger, UploadVideoController, IUploadVideoDTO, IUploadVideoResult, inject, injectable, UploadVideoUseCase (+4 more)

### Community 61 - "🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI"
Cohesion: 0.23
Nodes (8): IJoinQueueDTO, QueueStatus, IUpdateQueueItemDTO, PrismaQueueStatus, toDTO(), toPrisma(), QueueWaitEstimate, computeIdentityKey()

### Community 62 - "Categorias"
Cohesion: 0.12
Nodes (16): 1. Backup, 2. Marcar a baseline como aplicada (SEM executar), 3. Aplicar as migrations pendentes reais, 4. Validar, 5. Verificar funcionamento da aplicação, ⚠️ AÇÃO DESTRUTIVA PENDENTE DE APROVAÇÃO HUMANA, Coluna `userId` (UUID, FK → users), Contato (+8 more)

### Community 63 - "app.ts"
Cohesion: 0.12
Nodes (17): dotenv-cli, devDependencies, dotenv-cli, prisma, @testcontainers/postgresql, @types/node, @types/node-cron, @types/pg (+9 more)

### Community 64 - "ListBarbershopsUseCase.ts"
Cohesion: 0.20
Nodes (11): adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema, adminUpdateUserSchema, searchQuerySchema (+3 more)

### Community 65 - "ListQueueController.ts"
Cohesion: 0.14
Nodes (6): IAppointmentRepository, buildReminderMessage(), restoreClientPackageInTx(), GetQueueWaitEstimateUseCase, inject, injectable

### Community 66 - "Google Cloud Storage — setup AgendAI"
Cohesion: 0.20
Nodes (5): IBookPackageSlotDTO, IClientPackageRepository, assertOwner(), assertPackageBookable(), assertShopAccess()

### Community 67 - "13. Regras de Negócio Críticas"
Cohesion: 0.18
Nodes (11): ISellClientPackageDTO, ADMIN, futureDate, owner(), seedClientAndPackage(), RequestingUser, SellClientPackageUseCase, batchSlotsOverlap() (+3 more)

### Community 68 - "Fiado"
Cohesion: 0.16
Nodes (6): TreeNode, TreeOptions, SeasonalDecomposition, correlation(), mean(), std()

### Community 69 - "GetBarbershopUseCase.ts"
Cohesion: 0.20
Nodes (6): VerifyEmailController, ForgotPasswordUseCase, logger, injectable, VerifyEmailUseCase, getFrontendUrl()

### Community 71 - "PlansController.ts"
Cohesion: 0.25
Nodes (8): EmailTemplateId, IEmailProvider, SendEmailInput, SendEmailResult, logger, ResendEmailProvider, injectable, MockEmailProvider

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.21
Nodes (12): loginSchema, LoginController, validateLogin, checkLock(), cleanupTimers(), getLockDuration(), getRemainingTTL(), lockTimers (+4 more)

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.20
Nodes (11): ExpenseRow, ExpenseWithCategory, FiadoRow, FiadoWithPayments, BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod, normalizeWhatsapp() (+3 more)

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.25
Nodes (7): assertSameBarbershop(), assertShopWhatsAppConnected(), buildPostImage(), defaultCtaText(), loadPostContext(), PostsController, toPostResponse()

### Community 75 - "dependencies"
Cohesion: 0.16
Nodes (7): DeleteQueueItemController, DeleteQueueItemUseCase, inject, injectable, NotifyQueuePositionUpdatesUseCase, inject, injectable

### Community 76 - "Passo a passo"
Cohesion: 0.20
Nodes (13): enqueuePostBroadcast(), getEvents(), getQueue(), PostBroadcastJobData, postBroadcastQueue, postBroadcastQueueEvents, createWorker(), ensurePostBroadcastWorker() (+5 more)

### Community 77 - "Despesas"
Cohesion: 0.22
Nodes (6): LogoutController, LogoutUseCase, injectable, AccessAction, logAccess(), LogAccessParams

### Community 78 - "Pagamentos"
Cohesion: 0.20
Nodes (7): PlansController, planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 80 - "7. Sistema de Assinaturas e Bloqueio de CPF"
Cohesion: 0.15
Nodes (11): IRegisterDTO, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate, mockTxScheduleCreateMany (+3 more)

### Community 81 - "Apêndice B — Endpoints por Role"
Cohesion: 0.18
Nodes (11): buildCreateBody(), buildUpdateArgs(), CREATED_POST_ROW, fakeUser(), mockBarbershopFindUnique, mockBroadcast, mockFeedPostCreate, mockFeedPostFindUnique (+3 more)

### Community 82 - "Agendamentos"
Cohesion: 0.33
Nodes (6): CachedWeatherProvider, DEFAULT_CONDITION, OpenMeteoWeatherProvider, WMO_CODES, DailyForecast, IWeatherProvider

### Community 83 - "Fila (Queue)"
Cohesion: 0.22
Nodes (4): CronLockOptions, withCronLock(), DistributedLock, RedisDistributedLock

### Community 84 - "Serviços"
Cohesion: 0.20
Nodes (4): GetScheduleController, GetScheduleUseCase, inject, injectable

### Community 85 - "setup-gcs.sh"
Cohesion: 0.18
Nodes (11): 9. Como Criar um Novo Módulo, Passo 10 — Schema Prisma, Passo 1 — DTOs, Passo 2 — Interface do Repositório, Passo 3 — Mock Repository (para testes), Passo 4 — Implementação Prisma, Passo 5 — Schemas Zod, Passo 6 — UseCases (+3 more)

### Community 86 - "VerifyEmailController.ts"
Cohesion: 0.18
Nodes (11): bcryptjs, @fastify/swagger-ui, google-auth-library, ioredis, @opentelemetry/exporter-prometheus, dependencies, bcryptjs, @fastify/swagger-ui (+3 more)

### Community 87 - "PlansController"
Cohesion: 0.18
Nodes (10): Achados e correções aplicadas neste ciclo, Casos executáveis (inclusos no plano), Casos manuais → automatizados, Controles validados (sem achado novo), Inventário Graphify, Limitações, PENTEST-AUTH-001 — Authorization sem validação de scheme `Bearer` (corrigido), PENTEST-AUTH-002 — Refresh JWT sem `jti` podia colidir no mesmo segundo (corrigido) (+2 more)

### Community 88 - "StaffUserController"
Cohesion: 0.18
Nodes (11): Barbearias, `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`, Logo — Fluxo via Signed URL (recomendado para produção), Logo — Upload Direto via Multipart (mais simples) (+3 more)

### Community 89 - "11. Testes"
Cohesion: 0.20
Nodes (6): refundBodySchema, RefundPaymentController, RefundPaymentUseCase, inject, injectable, prismaMock

### Community 90 - "14. Integrações Externas"
Cohesion: 0.20
Nodes (10): 12. Erros Comuns e Como Evitá-los, ❌ Converter BigInt para Number, ❌ Esquecer de registrar o repositório no container, ❌ Esquecer `reflect-metadata` no setup de testes, ❌ Importar tipos Prisma do pacote diretamente, ❌ Instanciar Prisma fora de `prismaClient.ts`, ❌ Não registrar rota no `api.ts`, ❌ Passar string de token JWT diretamente em `expiresIn` (+2 more)

### Community 91 - "5. Convenções de Código"
Cohesion: 0.22
Nodes (8): args, base, once, probe(), run(), serviceId, shopId, token

### Community 92 - "Admin — Entidades Bloqueadas"
Cohesion: 0.20
Nodes (5): AdminFinancialController, EnrichedBarbershop, ExpenseRow, FiadoRow, FiadoSummaryRow

### Community 93 - "Admin — Notificações"
Cohesion: 0.33
Nodes (6): assertAppointmentBookable(), countEligibleStaff(), DbClient, overlaps(), timeToMinutes(), assertPublicShopOperationalAccess()

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
Cohesion: 0.28
Nodes (5): ListBarbershopsController, ListBarbershopsUseCase, inject, injectable, toPublicBarbershop()

### Community 101 - "Assinaturas"
Cohesion: 0.22
Nodes (5): DailyLimitExceededError, GeneratePostInput, baseInput, mockRedisGet, mockRedisSet

### Community 102 - "Auth"
Cohesion: 0.28
Nodes (5): ListQueueController, toPublicView(), ListQueueUseCase, inject, injectable

### Community 103 - "Financeiro da Barbearia"
Cohesion: 0.31
Nodes (4): ExportUserDataController, ExportUserDataUseCase, IExportUserDataDTO, injectable

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
Cohesion: 0.25
Nodes (7): Alertas mínimos, Auditoria de dados sensíveis, Backup, restauração e rollback, Gate de lançamento, Operação do MVP público, Smoke comportamental, Staging isolado

### Community 108 - "disposable-email-domains"
Cohesion: 0.25
Nodes (7): Achados confirmados, Controles validados, Evidência de mapeamento, Limitações e próximas verificações, PENTEST-INPUT-001 — URLs de imagem do feed sem esquema permitido, PENTEST-INPUT-002 — conteúdo HTML do feed é armazenado sem sanitização de domínio, Pentest local — inputs, upload, XSS e exposição pública

### Community 109 - "@fastify/cors"
Cohesion: 0.25
Nodes (8): `DELETE /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, Fiado, `GET /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /fiado` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /fiado/summary` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /fiado/:id/payments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `POST /fiado` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋

### Community 110 - "@fastify/helmet"
Cohesion: 0.29
Nodes (4): issueProratedRefundMock, prismaMock, cancelReasonSchema, CancelSubscriptionController

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

### Community 141 - "UpdateQueueItemUseCase.ts"
Cohesion: 0.50
Nodes (4): Auth, `GET /auth/me` 🔒, `POST /auth/login`, `POST /auth/refresh`

### Community 142 - "GoogleLoginUseCase"
Cohesion: 0.50
Nodes (4): Financeiro da Barbearia, `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋

## Knowledge Gaps
- **745 isolated node(s):** `docker-entrypoint.sh script`, `args`, `base`, `token`, `shopId` (+740 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **59 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `MercadoPagoService` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `IBarbershopRepository`, `AppError`, `💈 AgendAI — Backend API`, `IBarbershopResponseDTO`, `IStorageProvider`, `appointments.spec.ts`, `auth.routes.ts`, `IUserResponseDTO`, `IPaymentDTO.ts`, `SubscribeUseCase.ts`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `emailWorker.ts`, `monitor-routes.js`, `planEconomics.ts`, `index.ts`, `Referência Completa de Rotas`, `appointmentUseCases.ts`, `payments.spec.ts`, `referralService.ts`, `index.ts`, `IEmailProvider.ts`, `CreateBarbershopUseCase`, `9. Como Criar um Novo Módulo`, `12. Erros Comuns e Como Evitá-los`, `IAppointmentRepository`, `GetQueueMetricsUseCase`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `ListBarbershopsUseCase.ts`, `13. Regras de Negócio Críticas`, `GetBarbershopUseCase.ts`, `enqueueWhatsApp`, `6. Sistema de Autenticação e Autorização`, `Pagamentos`, `11. Testes`, `Admin — Entidades Bloqueadas`, `Admin — Notificações`, `postgres.ts`, `Financeiro da Barbearia`, `@fastify/helmet`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `prisma` connect `IPaymentDTO.ts` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `AppError`, `💈 AgendAI — Backend API`, `IStorageProvider`, `appointments.spec.ts`, `IPlanResponseDTO`, `auth.routes.ts`, `MercadoPagoService`, `IUserResponseDTO`, `RegisterUseCase.ts`, `IPaymentResponseDTO`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `emailWorker.ts`, `IPaymentRepository`, `monitor-routes.js`, `planEconomics.ts`, `index.ts`, `appointmentUseCases.ts`, `payments.spec.ts`, `referralService.ts`, `devDependencies`, `CreateBarbershopUseCase`, `QueueRepository`, `12. Erros Comuns e Como Evitá-los`, `IAppointmentRepository`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `ListBarbershopsUseCase.ts`, `13. Regras de Negócio Críticas`, `GetBarbershopUseCase.ts`, `PlansController.ts`, `6. Sistema de Autenticação e Autorização`, `Despesas`, `Pagamentos`, `Fila (Queue)`, `Admin — Entidades Bloqueadas`, `Admin — Notificações`, `Financeiro da Barbearia`, `@fastify/helmet`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `IFiadoRepository` connect `IFiadoResponseDTO` to `postgres.ts`, `IServiceResponseDTO`, `index.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 24 inferred relationships involving `authenticate()` (e.g. with `onboardingRoutes()` and `adminRoutes()`) actually correct?**
  _`authenticate()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `setRlsContext()` (e.g. with `onboardingRoutes()` and `adminRoutes()`) actually correct?**
  _`setRlsContext()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `args`, `base` to the rest of the system?**
  _745 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05678375042082819 - nodes in this community are weakly interconnected._