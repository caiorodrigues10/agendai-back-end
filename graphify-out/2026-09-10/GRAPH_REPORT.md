# Graph Report - agendai-back-end  (2026-09-10)

## Corpus Check
- 742 files · ~260,662 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5082 nodes · 11567 edges · 285 communities (206 shown, 79 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 354 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `19a5e062`
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
- CrmController
- 14. Integrações Externas
- 5. Convenções de Código
- Admin — Entidades Bloqueadas
- CrmRepository.ts
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
- AGENTS.md
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
- SubscribeController.ts
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
- CancelSubscriptionController.ts
- check-docs.mjs
- ProcessAsaasWebhookUseCase.ts
- ExportFinancialDataUseCase.ts
- resendWebhookService.ts
- GetPaymentStatusUseCase
- AGENTS.md — AgendAI Backend
- IPaymentRepository
- Arquitetura backend — Clean Architecture e SOLID
- queueDuplicate.ts
- Estrutura — Backend (`agendai-back-end`)
- calendar.routes.ts
- CheckInAppointmentUseCase.ts
- SetupTrialCardUseCase
- onboarding.routes.ts
- verifyRecaptcha.ts
- ResetPasswordUseCase
- notifications.routes.ts
- .barbershopId
- seed.ts
- Auth
- Sistema de Assinaturas
- users.routes.ts
- bcryptjs
- ListSubscriptionsController
- copilot-instructions.md
- google-auth-library
- ioredis
- @opentelemetry/exporter-prometheus
- @testcontainers/postgresql
- typescript
- DeleteAvatarUseCase
- DailyCloseoutController
- GetWeatherForecastUseCase.ts
- CrmController.ts
- .execute
- subscribe.spec.ts
- @opentelemetry/instrumentation-fastify
- ChargeTrialEndedSubscriptionsUseCase
- paymentProviderSnapshot.ts
- GetCrmForecastUseCase
- subscriptionAccess.ts
- RecordActivationEventUseCase
- reconciliationService.ts
- @fastify/cors
- ExportFinancialDataUseCase
- ListSubscriptionsController
- StaffUseCases
- GoogleLoginUseCase
- LogoutController.ts
- catalogTemplates.ts
- WhatsAppConnectionUseCase
- DepositUseCases
- IntegrationRepository
- IntegrationUseCases
- onboarding.routes.ts
- ListQueueController.ts
- CrmController.ts
- formRepository.ts
- productUseCases.ts
- resourceRepository.ts
- CancelSubscriptionController.ts
- proratedRefundService.spec.ts
- staffRepository.ts
- users.routes.ts
- CopilotController
- PlansController
- verifyRecaptcha.ts
- AdminNotificationController
- blockedEntitySchemas.ts
- MeController.ts
- ReputationController
- enhancedDemandPredictor.ts
- subscriptionAccess.ts
- wallet.routes.ts
- categories.routes.ts
- bcryptjs
- @fastify/swagger
- pino
- .constructor

## God Nodes (most connected - your core abstractions)
1. `AppError` - 231 edges
2. `prisma` - 173 edges
3. `authenticate()` - 117 edges
4. `setRlsContext()` - 111 edges
5. `authorize()` - 110 edges
6. `checkSubscription()` - 106 edges
7. `checkDashboardAccess()` - 63 edges
8. `apiRoutes()` - 62 edges
9. `IBarbershopRepository` - 58 edges
10. `getRedisConnection()` - 53 edges

## Surprising Connections (you probably didn't know these)
- `qualifyReferralOnPayment()` --indirect_call--> `base()`  [INFERRED]
  src/modules/referrals/services/referralService.ts → src/modules/products/catalogTemplates.ts
- `buildAuthProbeApp()` --indirect_call--> `authenticate()`  [INFERRED]
  src/tests/pentest/auth-session.pentest.spec.ts → src/shared/infra/http/middlewares/authenticate.ts
- `analyticsRoutes()` --indirect_call--> `checkDashboardAccess()`  [INFERRED]
  src/modules/analytics/routes/analytics.routes.ts → src/shared/infra/http/middlewares/checkDashboardAccess.ts
- `analyticsRoutes()` --indirect_call--> `checkSubscription()`  [INFERRED]
  src/modules/analytics/routes/analytics.routes.ts → src/shared/infra/http/middlewares/checkSubscription.ts
- `reviewRoutes()` --indirect_call--> `checkSubscription()`  [INFERRED]
  src/modules/appointments/routes/review.routes.ts → src/shared/infra/http/middlewares/checkSubscription.ts

## Import Cycles
- None detected.

## Communities (285 total, 79 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.15
Nodes (56): activationRoutes(), analyticsRoutes(), ActivationController, reviewRoutes(), cashMovementRoutes(), catalogRoutes(), clientPortalRoutes(), copilotRoutes() (+48 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.06
Nodes (38): FiadoController, FiadoStatus, ICreateFiadoDTO, ICreateFiadoPaymentDTO, IFiadoListQuery, IFiadoPaymentResponseDTO, IFiadoResponseDTO, IFiadoSummary (+30 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.12
Nodes (16): ProductsController, shopId(), adjustmentSchema, createProductSchema, createReceiptSchema, createRetailSaleSchema, installTemplateSchema, listProductsQuerySchema (+8 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.06
Nodes (40): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+32 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.14
Nodes (10): BackfillCrmUseCase, CrmPermission, CrmUser, GetCrmClientUseCase, GetCrmForecastUseCase, GetCrmOverviewUseCase, ListCrmClientsUseCase, MergeCrmClientsUseCase (+2 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.06
Nodes (28): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, createServiceSchema, updateServiceSchema (+20 more)

### Community 6 - "index.ts"
Cohesion: 0.12
Nodes (16): allowDevModeWebhooks(), ProcessAbacateWebhookUseCase, skipApiVerification(), injectable, qualifyReferralOnPayment(), assertTransition(), handleSubscriptionPaymentWebhook(), logger (+8 more)

### Community 7 - "compilerOptions"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.11
Nodes (39): assertShopAccess(), detachEvolutionInstanceWithTimeout(), ShopWhatsAppDto, ShopWhatsAppStatus, WhatsAppConnectInput, requireOpenShopWhatsAppInstance(), evolutionNotConfiguredError(), shopEvolutionInstanceName() (+31 more)

### Community 9 - "AppError"
Cohesion: 0.07
Nodes (30): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+22 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.22
Nodes (6): reviewSchema, blockOwnerCpfs(), JwtPayload, checkDashboardAccess(), checkSubscription(), financial

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.07
Nodes (27): ClientPackageController, resolveBarbershopId(), ServicePackageController, IBookPackageSlotDTO, ISellClientPackageDTO, ADMIN, futureDate, owner() (+19 more)

### Community 12 - "normalizeCpf"
Cohesion: 0.15
Nodes (15): assertPaymentProviderEnabled(), EnabledPaymentProvider, enabledPaymentProviders(), IInvoiceResponseDTO, ISubscribeDTO, ISubscriptionResponseDTO, SubscriptionStatus, makeFullSubscription() (+7 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.09
Nodes (28): AdminUserController, BlockedEntityAdminController, logger, attachReferralOnRegister(), buildSubscriptionRequiredError(), checkBarbershopAccess(), checkCnpjAccess(), unblockOwnerCpfs() (+20 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.16
Nodes (14): OperationMode, ChangeOperationModeController, ChangeOperationModeDTO, ChangeOperationModeResult, ChangeOperationModeUseCase, inject, injectable, assertOperationEnabled() (+6 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.08
Nodes (37): CronLogger, scheduleDepositExpiration(), ChargeTrialEndedSubscriptionsUseCase, injectable, CronLogger, scheduleWaitlistExpiration(), getProcessRole(), shouldRunApi() (+29 more)

### Community 16 - "IAppointmentResponseDTO"
Cohesion: 0.05
Nodes (37): ./*, config/*, dist, dtos/*, ES2022, libs/*, modules/*, node_modules (+29 more)

### Community 17 - "auth.routes.ts"
Cohesion: 0.05
Nodes (17): WaitlistController, CreateEntryData, CreateOfferData, ListEntriesFilters, UpdateEntryData, WaitlistRepository, CreateWaitlistEntryInput, createWaitlistEntrySchema (+9 more)

### Community 18 - "MercadoPagoService"
Cohesion: 0.06
Nodes (16): CorporateController, CorporateRepository, CreatePlanInput, planSelect, subscriptionSelect, UpdatePlanInput, billingCycleMap, corporatePlanStatusMap (+8 more)

### Community 19 - "IUserResponseDTO"
Cohesion: 0.10
Nodes (14): CancelPaymentController, CancelPaymentUseCase, logger, injectable, ListPaymentsUseCase, inject, injectable, abacateServiceMock (+6 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.14
Nodes (13): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentRepository, AppointmentWithRelations (+5 more)

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.03
Nodes (55): sensitiveRoutes, adapter, hasSslMode, pool, prisma, EnrichedBarbershop, ExpenseRow, FiadoRow (+47 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.15
Nodes (10): AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput, allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody (+2 more)

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.08
Nodes (23): AppointmentController, availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR, slotsQuerySchema (+15 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.43
Nodes (5): AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.17
Nodes (9): AdminAuditLogController, AdminReferralsController, auditLogController, barbershopController, blockedEntityController, dashboardController, notificationController, referralsController (+1 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.10
Nodes (19): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, injectable (+11 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.09
Nodes (34): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DailyLimitExceededError (+26 more)

### Community 28 - "IQueueRepository"
Cohesion: 0.17
Nodes (15): GetSubscriptionController, loadActivePlans(), SubscriptionEconomicsController, computePlanEconomics(), computePlatformEconomics(), inferBillingCycle(), inferTierKey(), monthsBetween() (+7 more)

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.06
Nodes (21): VisitController, AddItem, CloseTab, CreateVisit, RecordPayment, VisitRepository, visitSelect, addItemSchema (+13 more)

### Community 30 - "queue.spec.ts"
Cohesion: 0.27
Nodes (7): issueAuthSession(), mapRole(), UserLike, UserLike, logger, UserLike, UserWithEmailPassword

### Community 31 - "LogoController.ts"
Cohesion: 0.18
Nodes (9): createBarbershopSchema, phoneBR, scheduleItemSchema, updateBarbershopSchema, CreateBarbershopController, UpdateBarbershopController, isValidCnpj(), maskCnpj() (+1 more)

### Community 32 - "emailWorker.ts"
Cohesion: 0.16
Nodes (10): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+2 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.18
Nodes (8): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.12
Nodes (4): IQueueItemResponseDTO, MockQueueRepository, QueueRepository, QueueWaitEstimate

### Community 35 - "monitor-routes.js"
Cohesion: 0.08
Nodes (23): ICreateUserDTO, RoleLiteral, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, EmployeePermission, IUserResponseDTO, RoleLiteral, MockUserRepository (+15 more)

### Community 36 - "scripts"
Cohesion: 0.07
Nodes (28): scripts, build, db:migrate:status, db:push, db:push:prod, db:studio, db:validate-schema, dev (+20 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.15
Nodes (7): MercadoPagoService, injectable, GetPaymentStatusController, GetPaymentStatusUseCase, inject, injectable, inject

### Community 38 - "index.ts"
Cohesion: 0.07
Nodes (14): LoyaltyController, AdjustManualInput, adjustManualSchema, ConfigureLoyaltyProgramInput, configureLoyaltyProgramSchema, RecordCashbackInput, recordCashbackSchema, RecordVisitInput (+6 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.17
Nodes (12): assertProductPermission(), canGiveDiscount(), canOverrideProductPrice(), canSeeProductCosts(), COST_PERMISSIONS, isPrivilegedActor(), loadEmployeePermissions(), ProductActor (+4 more)

### Community 41 - "payments.spec.ts"
Cohesion: 0.38
Nodes (3): ExportUserDataController, ExportUserDataUseCase, injectable

### Community 42 - "IQueueItemResponseDTO"
Cohesion: 0.11
Nodes (19): 💈 AgendAI — Backend API, Autenticação, Com Docker (recomendado), Como Rodar, Configuração do Ambiente, Documentação Swagger, Estrutura do Projeto, Principais entidades (+11 more)

### Community 43 - "assertAppointmentBookable.ts"
Cohesion: 0.12
Nodes (16): Admin — Audit Logs, Admin — Dashboard, Admin — Financeiro, `GET /admin/audit-logs` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/dashboard`, `GET /admin/financial/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/overview` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/summary` 🔒 🛡️ `MASTER_ADMIN` (+8 more)

### Community 44 - "referralService.ts"
Cohesion: 0.17
Nodes (16): ReferralsController, applyReferralCode(), ensureReferralCode(), generateCode(), getReferralDashboard(), logger, tierLabel(), GetMyReferralsUseCase (+8 more)

### Community 45 - "index.ts"
Cohesion: 0.07
Nodes (36): GetBarbershopController, GetBarbershopUseCase, inject, injectable, ListBarbershopsController, ListBarbershopsUseCase, inject, injectable (+28 more)

### Community 46 - ".findById"
Cohesion: 0.14
Nodes (14): ExpenseCategoryRecord, mapExpenseCategoryToDTO(), mapServiceCategoryToDTO(), ServiceCategoryRecord, ExpenseCategoryRepository, ServiceCategoryRepository, IExpenseCategoryRepository, IServiceCategoryRepository (+6 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.14
Nodes (7): DepositController, ConfirmDepositInput, confirmDepositSchema, DepositListQueryInput, depositListQuerySchema, UpdateDepositPolicyInput, updateDepositPolicySchema

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.22
Nodes (8): ICreateServicePackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map(), ServicePackageRepository, IServicePackageRepository

### Community 49 - "devDependencies"
Cohesion: 0.13
Nodes (24): agendaiWordmark(), badge(), buildPostSvg(), escapeXml(), formatBRL(), hoursCard(), LayoutCtx, photoPanel() (+16 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.22
Nodes (4): classifyMaturity(), confidenceInterval(), DemandPredictor, walkForwardBacktest()

### Community 51 - "server.ts"
Cohesion: 0.18
Nodes (20): VerifyEmailController, VerifyEmailUseCase, apiUrl(), buildForgotPasswordEmail(), buildVerifyEmail(), escapeHtml(), emailLayout(), frontendUrl() (+12 more)

### Community 52 - "QueueRepository"
Cohesion: 0.06
Nodes (19): PurchasingController, AddItemInput, CreateOrderInput, itemSelect, orderSelect, PurchasingRepository, ReceiveOrderInput, UpdateOrderInput (+11 more)

### Community 53 - "GcsStorageProvider"
Cohesion: 0.10
Nodes (21): AgendAI Back‑end — Manual do Sistema, Autenticação e Autorização, Banco de Dados (Prisma), Com Docker, Como Adicionar um Novo Caso de Uso/Endpoint, Convenções, Definições, Dicas para IA (+13 more)

### Community 54 - "9. Como Criar um Novo Módulo"
Cohesion: 0.16
Nodes (20): BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField, listClientPackagesQuerySchema, listServicePackagesQuerySchema, SellClientPackageInput (+12 more)

### Community 55 - "Barbearias"
Cohesion: 0.04
Nodes (49): ConfirmLogoUseCase, inject, injectable, DeleteLogoUseCase, inject, injectable, GetLogoUploadUrlUseCase, IGetLogoUploadUrlDTO (+41 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.09
Nodes (29): assertSameBarbershop(), assertShopWhatsAppConnected(), buildPostImage(), defaultCtaText(), ENUM_TO_INPUT, loadPostContext(), logger, PostRow (+21 more)

### Community 58 - "AdminDashboardController.ts"
Cohesion: 0.06
Nodes (18): VoucherController, CreateInput, UpdateInput, usageSelect, VoucherRepository, voucherSelect, applyVoucherSchema, createVoucherSchema (+10 more)

### Community 59 - "IAppointmentRepository"
Cohesion: 0.50
Nodes (4): Admin — Assinaturas, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions` 🔒 🛡️ `MASTER_ADMIN`

### Community 60 - "GetQueueMetricsUseCase"
Cohesion: 0.20
Nodes (10): ALLOWED_MIME_SET, logger, UploadVideoController, IUploadVideoDTO, IUploadVideoResult, inject, injectable, UploadVideoUseCase (+2 more)

### Community 61 - "🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI"
Cohesion: 0.07
Nodes (9): AbacatePayService, injectable, AsaasService, injectable, ProratedRefundInput, inject, inject, inject (+1 more)

### Community 62 - "Categorias"
Cohesion: 0.17
Nodes (11): 1. Preparação, 2. Pré-validação, 3. Aplicação, 4. Pós-validação, Escala horizontal, Estado conhecido, Falhas e recuperação, Fluxo de deploy (+3 more)

### Community 63 - "app.ts"
Cohesion: 0.06
Nodes (31): dotenv-cli, devDependencies, dotenv-cli, prisma, @testcontainers/postgresql, tsup, tsx, @types/bcryptjs (+23 more)

### Community 64 - "ListBarbershopsUseCase.ts"
Cohesion: 0.13
Nodes (15): AdminBarbershopController, adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListBlockedEntitiesQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema (+7 more)

### Community 65 - "ListQueueController.ts"
Cohesion: 0.15
Nodes (12): buildQueueUpdateMessage(), calendarDateParts(), createAppointmentAtomic(), FORBIDDEN_TRANSITIONS, formatSaoPauloTime(), mapCreatedAppointment(), ReminderResult, scheduledInstant() (+4 more)

### Community 66 - "Google Cloud Storage — setup AgendAI"
Cohesion: 0.50
Nodes (4): Admin — Planos, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/plans` 🔒 🛡️ `MASTER_ADMIN`

### Community 67 - "13. Regras de Negócio Críticas"
Cohesion: 0.17
Nodes (13): createPublicAppointmentToken(), PublicAppointmentPayload, PublicPurpose, readPublicAppointmentToken(), appointmentInstant(), getAppointment(), PublicAppointmentManagementUseCase, assertAppointmentBookable() (+5 more)

### Community 68 - "Fiado"
Cohesion: 0.15
Nodes (9): FEATURE_NAMES, MaturityLevel, RECOMMENDATIONS, TreeNode, TreeOptions, SeasonalDecomposition, correlation(), mean() (+1 more)

### Community 70 - "CheckInAppointmentController.ts"
Cohesion: 0.06
Nodes (14): GiftCardController, GiftCardRepository, giftCardSelect, PurchaseInput, RedeemInput, usageSelect, giftCardListQuerySchema, giftCardStatusMap (+6 more)

### Community 71 - "PlansController.ts"
Cohesion: 0.25
Nodes (8): EmailTemplateId, IEmailProvider, SendEmailInput, SendEmailResult, logger, ResendEmailProvider, injectable, MockEmailProvider

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.50
Nodes (4): Assinaturas, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `GET /subscriptions/me` 🔒, `POST /subscriptions` 🔒 🛡️ `MASTER_ADMIN, OWNER`

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.09
Nodes (19): BarbershopFinancialController, ExpenseRow, ExpenseWithCategory, FiadoRow, FiadoWithPayments, BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod (+11 more)

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.07
Nodes (13): ProfitController, entrySelect, ProfitRepository, settingsSelect, profitByServiceQuerySchema, profitByStaffQuerySchema, profitComputeSchema, profitManualAdjustmentSchema (+5 more)

### Community 75 - "dependencies"
Cohesion: 0.24
Nodes (4): GetQueueMetricsController, GetQueueMetricsUseCase, inject, injectable

### Community 76 - "Passo a passo"
Cohesion: 0.14
Nodes (16): setupSwagger(), buildApp(), checkDatabase(), checkMigrations(), checkRedis(), healthRoutes(), correlationIdMiddleware(), registerRoutes() (+8 more)

### Community 77 - "Despesas"
Cohesion: 0.06
Nodes (39): forgotPasswordSchema, googleLoginSchema, loginSchema, phoneBR, refreshSchema, registerSchema, resetPasswordSchema, scheduleItemSchema (+31 more)

### Community 78 - "Pagamentos"
Cohesion: 0.32
Nodes (6): planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 81 - "Apêndice B — Endpoints por Role"
Cohesion: 0.18
Nodes (11): buildCreateBody(), buildUpdateArgs(), CREATED_POST_ROW, fakeUser(), mockBarbershopFindUnique, mockBroadcast, mockFeedPostCreate, mockFeedPostFindUnique (+3 more)

### Community 82 - "Agendamentos"
Cohesion: 0.33
Nodes (6): CachedWeatherProvider, DEFAULT_CONDITION, OpenMeteoWeatherProvider, WMO_CODES, DailyForecast, IWeatherProvider

### Community 83 - "Fila (Queue)"
Cohesion: 0.20
Nodes (16): catalogListQuerySchema, comboItemSchema, createAddonSchema, createComboSchema, createVariationSchema, updateAddonSchema, updateComboItemSchema, updateComboSchema (+8 more)

### Community 84 - "Serviços"
Cohesion: 0.12
Nodes (9): updateScheduleSchema, GetScheduleController, GetScheduleUseCase, inject, injectable, UpdateScheduleController, inject, injectable (+1 more)

### Community 85 - "setup-gcs.sh"
Cohesion: 0.18
Nodes (11): 9. Como Criar um Novo Módulo, Passo 10 — Schema Prisma, Passo 1 — DTOs, Passo 2 — Interface do Repositório, Passo 3 — Mock Repository (para testes), Passo 4 — Implementação Prisma, Passo 5 — Schemas Zod, Passo 6 — UseCases (+3 more)

### Community 87 - "PlansController"
Cohesion: 0.18
Nodes (10): Achados e correções aplicadas neste ciclo, Casos executáveis (inclusos no plano), Casos manuais → automatizados, Controles validados (sem achado novo), Inventário Graphify, Limitações, PENTEST-AUTH-001 — Authorization sem validação de scheme `Bearer` (corrigido), PENTEST-AUTH-002 — Refresh JWT sem `jti` podia colidir no mesmo segundo (corrigido) (+2 more)

### Community 88 - "StaffUserController"
Cohesion: 0.18
Nodes (11): Barbearias, `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`, Logo — Fluxo via Signed URL (recomendado para produção), Logo — Upload Direto via Multipart (mais simples) (+3 more)

### Community 89 - "CrmController"
Cohesion: 0.09
Nodes (27): IBillingAddressDTO, ICardPayerDTO, ICreateCardPaymentDTO, ICreatePixPaymentDTO, IPaymentResponseDTO, IPixQrCodeDTO, PaymentMethod, PaymentProvider (+19 more)

### Community 90 - "14. Integrações Externas"
Cohesion: 0.20
Nodes (10): 12. Erros Comuns e Como Evitá-los, ❌ Converter BigInt para Number, ❌ Esquecer de registrar o repositório no container, ❌ Esquecer `reflect-metadata` no setup de testes, ❌ Importar tipos Prisma do pacote diretamente, ❌ Instanciar Prisma fora de `prismaClient.ts`, ❌ Não registrar rota no `api.ts`, ❌ Passar string de token JWT diretamente em `expiresIn` (+2 more)

### Community 91 - "5. Convenções de Código"
Cohesion: 0.22
Nodes (8): args, base, once, probe(), run(), serviceId, shopId, token

### Community 92 - "Admin — Entidades Bloqueadas"
Cohesion: 0.12
Nodes (8): GoalController, CreateGoalInput, createGoalSchema, GoalQueryInput, goalQuerySchema, UpdateGoalInput, updateGoalSchema, GoalUseCases

### Community 93 - "CrmRepository.ts"
Cohesion: 0.06
Nodes (21): CashMovementController, CashMovementFilters, CashMovementRepository, CreateCashMovementData, CashMovementQueryInput, cashMovementQuerySchema, CreateCashMovementInput, createCashMovementSchema (+13 more)

### Community 94 - "Admin — Usuários"
Cohesion: 0.10
Nodes (34): getNotificationV2Mode(), NotificationType, emailDestination(), EmailJobData, emailNotificationType(), emailQueue, emailQueueEvents, enqueueEmail() (+26 more)

### Community 96 - "postgres.ts"
Cohesion: 0.06
Nodes (16): QualityController, auditSelect, CreateProtocolInput, protocolSelect, QualityRepository, RunAuditInput, UpdateProtocolInput, createProtocolSchema (+8 more)

### Community 98 - "Admin — Assinaturas"
Cohesion: 0.22
Nodes (9): 10. Como Criar um Novo Endpoint, 15. Checklist antes de Finalizar uma Tarefa, 1. Visão Geral do Projeto, 2. Stack e Versões, 4. Estrutura de Pastas, 🤖 AI_GUIDE.md — Guia histórico do Backend AgendAI, Apêndice A — Mapa de Tokens de Injeção, Exemplo completo — `GET /reviews` (+1 more)

### Community 99 - "Admin — Barbearias"
Cohesion: 0.22
Nodes (9): Categorias, `DELETE /expense-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /service-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `GET /expense-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `GET /service-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋, `PATCH /expense-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `PATCH /service-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `POST /expense-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋 (+1 more)

### Community 100 - "Admin — Planos"
Cohesion: 0.12
Nodes (29): findExisting(), NotificationPayload, NotificationV2Mode, resolveSkipReason(), scheduleNotification(), ScheduleNotificationInput, uniqueKey(), canOwnerConfigureNotification() (+21 more)

### Community 101 - "Assinaturas"
Cohesion: 0.07
Nodes (15): PricingController, CreateInput, PricingRepository, ruleSelect, UpdateInput, createPricingRuleSchema, evaluatePriceSchema, pricingRuleTypeMap (+7 more)

### Community 102 - "Auth"
Cohesion: 0.17
Nodes (7): channelName(), isRealtimeEvent(), logger, RealtimeEvent, RealtimeHub, RealtimeTopic, SendableSocket

### Community 103 - "Financeiro da Barbearia"
Cohesion: 0.06
Nodes (13): adapter, defaultPlans, pool, prisma, inject, inject, inject, inject (+5 more)

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

### Community 110 - "AGENTS.md"
Cohesion: 0.13
Nodes (7): Claude, dependencies, devDependencies, Inventário de pacotes — Backend (agendai-back-end), Inventário de scripts — Backend (`agendai-back-end`), Observações críticas, Gemini

### Community 111 - "@fastify/multipart"
Cohesion: 0.07
Nodes (16): WalletController, CreditInput, DebitInput, entrySelect, TransferInput, WalletRepository, walletSelect, creditWalletSchema (+8 more)

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
Cohesion: 0.14
Nodes (16): getMonitoringDashboard(), hoursAgo(), minutesAgo(), getNotificationOperationsHealth(), heartbeatStatus(), ProcessRole, RedisRateLimitStore, getEvents() (+8 more)

### Community 128 - "tsup"
Cohesion: 0.12
Nodes (18): broadcastPostToClients(), logger, mockEnqueue, mockFindMany, mockFindUnique, enqueuePostBroadcast(), getEvents(), getQueue() (+10 more)

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
Cohesion: 0.24
Nodes (12): refreshCrmCampaignStatus(), prismaMock, loadNotificationPayload(), claimAttempt(), completeAttempt(), createWorker(), failAttempt(), isFinalAttempt() (+4 more)

### Community 142 - "GoogleLoginUseCase"
Cohesion: 0.50
Nodes (4): Financeiro da Barbearia, `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋

### Community 145 - "sendWhatsAppMessage"
Cohesion: 0.15
Nodes (18): header(), RawBodyRequest, ResendWebhookController, resendWebhookPreParsing(), recordTerminalNotificationFailure(), sanitizeNotificationError(), addSuppression(), applyEmailEvent() (+10 more)

### Community 146 - "Pentest local — inputs, upload, XSS e exposição pública"
Cohesion: 0.06
Nodes (12): WhatsAppAiController, normalizePhone(), WhatsAppAiRepository, intentLogsSchema, listConversationsSchema, processIncomingMessageSchema, detectIntent(), generateResponse() (+4 more)

### Community 147 - "UpdateBarbershopUseCase"
Cohesion: 0.07
Nodes (11): FiscalController, FiscalRepository, FiscalConfigInput, fiscalConfigSchema, FiscalStatsQueryInput, fiscalStatsQuerySchema, IssueNfeInput, issueNfeSchema (+3 more)

### Community 152 - "RefundPaymentUseCase"
Cohesion: 0.12
Nodes (15): IJoinQueueDTO, QueueStatus, IUpdateQueueItemDTO, PrismaQueueStatus, toDTO(), toPrisma(), IQueueRepository, DeleteQueueItemController (+7 more)

### Community 154 - "PENTEST_REPORT_TEMPLATE.md"
Cohesion: 0.05
Nodes (39): busboy, dayjs, fastify, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @fastify/swagger-ui, @fastify/websocket (+31 more)

### Community 155 - "fastify"
Cohesion: 0.09
Nodes (6): OrganizationController, createOrganizationSchema, inviteMemberSchema, updateMemberRoleSchema, updateOrganizationSchema, OrganizationUseCases

### Community 157 - "@testcontainers/postgresql"
Cohesion: 0.14
Nodes (12): CommissionSplit, RetailSalePayload, injectable, UpdateQueueItemUseCase, computeInsertJoinedAt(), ALLOWED_TRANSITIONS, assertQueueStatusTransition(), assertQueueTenantAccess() (+4 more)

### Community 158 - "@types/jsonwebtoken"
Cohesion: 0.23
Nodes (16): InventoryEngine, lockProduct(), injectable, Tx, writeMovement(), CatalogProductSnapshot, nextStockQty(), PlannedStockLine (+8 more)

### Community 159 - "app.security.spec.ts"
Cohesion: 0.14
Nodes (15): updateQueueItemSchema, notifyQueueCapacity(), mocks, JoinQueueController, JoinQueueUseCase, inject, injectable, UpdateQueueItemController (+7 more)

### Community 163 - "AsaasService.ts"
Cohesion: 0.12
Nodes (14): blockSchema, calendarRoutes(), exceptionSchema, id, policySchema, shopId(), CommissionController, retryNotification() (+6 more)

### Community 165 - "assertAppointmentBookable.ts"
Cohesion: 0.09
Nodes (13): MembershipController, CreateMembershipInput, CreateMembershipPlanInput, createMembershipPlanSchema, createMembershipSchema, MembershipListQueryInput, membershipListQuerySchema, RecordPaymentInput (+5 more)

### Community 166 - "ExportUserDataUseCase"
Cohesion: 0.13
Nodes (8): ReputationRepository, reputationSelect, RespondInput, reviewResponseSelect, reputationQuerySchema, respondToReviewSchema, ReputationUseCases, RespondInput

### Community 168 - "AdminNotificationController"
Cohesion: 0.14
Nodes (5): IAppointmentRepository, buildReminderMessage(), inject, GetQueueWaitEstimateUseCase, injectable

### Community 169 - "google-auth-library"
Cohesion: 0.13
Nodes (8): CopilotRepository, suggestionSelect, acceptSchema, copilotSuggestionTypeMap, dismissSchema, listSuggestionsSchema, markReadSchema, ListQuery

### Community 172 - "disposable-email-domains"
Cohesion: 0.15
Nodes (9): AuthConfig, extractBearerToken(), authenticateOptional(), JwtPayload, feedRoutes(), queueRoutes(), referralsRoutes(), validateSchema() (+1 more)

### Community 173 - "@opentelemetry/resources"
Cohesion: 0.08
Nodes (33): AsaasBillingType, AsaasCustomer, AsaasPayment, AsaasPixQrCode, AsaasRefund, logger, computeProratedAmount(), findApprovedPayment() (+25 more)

### Community 176 - "pino"
Cohesion: 0.22
Nodes (8): CrmCampaignListItem, CrmClientMetrics, CrmOverviewDTO, CrmSegment, buildClientMetrics(), CrmRepository, segmentFor(), ICrmRepository

### Community 182 - "payments.routes.ts"
Cohesion: 0.22
Nodes (9): Fiado / despesas / comissões, Fila / agenda / híbrido, Notificações, Pacotes, Pagamentos, Produtos / estoque / retail, Regras de negócio — Backend, Tenant, permissões, RLS (+1 more)

### Community 184 - "AdminBarbershopController"
Cohesion: 0.19
Nodes (16): addFieldSchema, createFormSchema, formFieldTypeEnum, formListQuerySchema, formResponseListQuerySchema, formTypeEnum, submitResponseSchema, updateFieldSchema (+8 more)

### Community 186 - "bruteForceProtection.spec.ts"
Cohesion: 0.23
Nodes (5): CrmController, resolveCampaignClientIds(), resolveShop(), { findUnique }, assertCrmAccess()

### Community 187 - "@fastify/rate-limit"
Cohesion: 0.18
Nodes (6): CronLogger, scheduleAppointmentReminders(), CronLockOptions, withCronLock(), DistributedLock, RedisDistributedLock

### Community 188 - "@google-cloud/storage"
Cohesion: 0.22
Nodes (8): Backup do Render, Cutover, Migração PostgreSQL Render → Supabase, Preparação do Supabase, Reconciliação obrigatória, Regras de segurança, Rollback, Variáveis

### Community 189 - "pg"
Cohesion: 0.12
Nodes (15): asaasConfig, configSchemas, createIntegrationSchema, credentialSchemas, evolutionApiConfig, googleCalendarConfig, icalConfig, nfsConfig (+7 more)

### Community 190 - "@upstash/redis"
Cohesion: 0.40
Nodes (3): insideRlsTx, rlsExtension, RequestContext

### Community 191 - "Runbook: Aplicar migrations do backend em Staging/Produção"
Cohesion: 0.24
Nodes (13): availabilityQuerySchema, createResourceBookingSchema, createResourceSchema, resourceBookingsListQuerySchema, resourceListQuerySchema, updateResourceBookingSchema, updateResourceSchema, AvailabilityQuery (+5 more)

### Community 200 - "CompleteServiceUseCase.ts"
Cohesion: 0.11
Nodes (23): CompleteAppointmentController, completeAppointmentSchema, CompleteAppointmentRequest, CompleteAppointmentUseCase, inject, injectable, backfillCrmLedger(), EventInput (+15 more)

### Community 203 - "index.ts"
Cohesion: 0.17
Nodes (11): ICommissionEntryDTO, ICommissionSplitDTO, ICommissionSummary, IListCommissionsQuery, CommissionRepository, CommissionWithRelations, dateFilter(), include (+3 more)

### Community 204 - "CancelSubscriptionController.ts"
Cohesion: 0.05
Nodes (31): IBarbershopResponseDTO, ManualShopStatus, OpeningMode, ScheduleExceptionDTO, ShopOpenStateDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO, BarbershopRepository (+23 more)

### Community 205 - "check-docs.mjs"
Cohesion: 0.29
Nodes (4): entryFiles, errors, pkg, root

### Community 206 - "ProcessAsaasWebhookUseCase.ts"
Cohesion: 0.15
Nodes (8): ExpenseCategoryController, expenseCatRepo, ServiceCategoryController, serviceCatRepo, createExpenseCategorySchema, createServiceCategorySchema, updateExpenseCategorySchema, updateServiceCategorySchema

### Community 207 - "ExportFinancialDataUseCase.ts"
Cohesion: 0.13
Nodes (6): CreateMembershipData, CreatePlanData, MembershipListFilters, RecordPaymentData, UpdatePlanData, MembershipUseCases

### Community 208 - "resendWebhookService.ts"
Cohesion: 0.12
Nodes (14): IRegisterDTO, RegisterUseCase, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate (+6 more)

### Community 209 - "GetPaymentStatusUseCase"
Cohesion: 0.22
Nodes (7): allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessAsaasWebhookUseCase, inject, injectable

### Community 210 - "AGENTS.md — AgendAI Backend"
Cohesion: 0.33
Nodes (6): 0. Regras essenciais, 1. O que é esta API, 2. Inventários locais, 3. Comandos frequentes, 4. Checklist de mudança, AGENTS.md — AgendAI Backend

### Community 212 - "Arquitetura backend — Clean Architecture e SOLID"
Cohesion: 0.33
Nodes (5): Arquitetura backend — Clean Architecture e SOLID, Fluxo de execução vs direção das dependências, Responsabilidades, SOLID (exemplos locais), Transações

### Community 213 - "queueDuplicate.ts"
Cohesion: 0.12
Nodes (15): buildQueueCalledMessage(), buildQueueCancelledMessage(), buildQueueJoinedMessage(), logger, notifyCustomerJoinedQueue(), NotifyQueuePositionResult, NotifyQueuePositionUpdatesUseCase, inject (+7 more)

### Community 214 - "Estrutura — Backend (`agendai-back-end`)"
Cohesion: 0.33
Nodes (5): Estrutura — Backend (`agendai-back-end`), Middlewares, Módulos (`src/modules/`), Providers / integrações (arquivos), Rotas HTTP (`shared/infra/http/routes/`)

### Community 216 - "CheckInAppointmentUseCase.ts"
Cohesion: 0.24
Nodes (11): assignServiceSchema, deleteScheduleSchema, removeServiceSchema, requestTimeOffSchema, timeOffQuerySchema, timeOffStatusEnum, upsertScheduleSchema, AssignServiceInput (+3 more)

### Community 218 - "onboarding.routes.ts"
Cohesion: 0.22
Nodes (7): IMercadoPagoWebhookDTO, ProcessWebhookController, webhookBodySchema, logger, ProcessWebhookUseCase, inject, injectable

### Community 220 - "ResetPasswordUseCase"
Cohesion: 0.40
Nodes (4): Checkout de assinatura (implementado), Domínios → persistência (visão), Mapa de domínio — Backend, Testes

### Community 221 - "notifications.routes.ts"
Cohesion: 0.29
Nodes (10): createShowcaseEntrySchema, showcaseEventQuerySchema, showcaseListQuerySchema, showcaseOrderSchema, updateShowcaseEntrySchema, CreateInput, EventQuery, ListQuery (+2 more)

### Community 223 - "seed.ts"
Cohesion: 0.50
Nodes (3): Comandos, Graphify — Backend, Procedimento obrigatório

### Community 224 - "Auth"
Cohesion: 0.50
Nodes (4): Auth, `GET /auth/me` 🔒, `POST /auth/login`, `POST /auth/refresh`

### Community 225 - "Sistema de Assinaturas"
Cohesion: 0.50
Nodes (4): Fluxo de assinatura, Sistema de Assinaturas, Status de assinatura, Trial

### Community 228 - "ListSubscriptionsController"
Cohesion: 0.22
Nodes (7): CheckInAppointmentController, checkInSchema, CheckInAppointmentUseCase, ICheckInDTO, ICheckInResult, logger, injectable

### Community 235 - "DeleteAvatarUseCase"
Cohesion: 0.22
Nodes (3): DeleteAccountUseCase, inject, injectable

### Community 237 - "GetWeatherForecastUseCase.ts"
Cohesion: 0.20
Nodes (5): GetWeatherForecastController, GetWeatherForecastUseCase, inject, injectable, CrmForecastDTO

### Community 243 - "paymentProviderSnapshot.ts"
Cohesion: 0.35
Nodes (9): clientPortalQuerySchema, confirmLinkSchema, createCareTemplateSchema, rejectLinkSchema, requestLinkSchema, requestOtpSchema, sendCareInstructionSchema, updateCareTemplateSchema (+1 more)

### Community 244 - "GetCrmForecastUseCase"
Cohesion: 0.20
Nodes (9): addonSelect, comboSelect, CreateAddon, CreateCombo, CreateVariation, UpdateAddon, UpdateCombo, UpdateVariation (+1 more)

### Community 246 - "RecordActivationEventUseCase"
Cohesion: 0.29
Nodes (6): CreateInput, entrySelect, UpdateInput, imageAuthorizationMap, showcaseModeMap, showcaseStatusMap

### Community 247 - "reconciliationService.ts"
Cohesion: 0.28
Nodes (5): ListPaymentsController, abacateWebhookPreParsing(), ListRefundsController, checkoutRateLimit, webhookRateLimit

### Community 252 - "GoogleLoginUseCase"
Cohesion: 0.20
Nodes (7): GoogleLoginUseCase, mockFindByEmail, mockUser, mockVerifyIdToken, prismaMock, inject, injectable

### Community 253 - "LogoutController.ts"
Cohesion: 0.29
Nodes (3): LogoutController, LogoutUseCase, injectable

### Community 254 - "catalogTemplates.ts"
Cohesion: 0.24
Nodes (7): BusinessSegment, base(), CATALOG_TEMPLATES, CatalogTemplate, getCatalogTemplate(), STOCK_EXPENSE, namesToSkip()

### Community 255 - "WhatsAppConnectionUseCase"
Cohesion: 0.27
Nodes (5): connectSchema, WhatsAppConnectionController, inject, injectable, WhatsAppConnectionUseCase

### Community 259 - "onboarding.routes.ts"
Cohesion: 0.31
Nodes (6): onboardingRoutes(), GetOnboardingUseCase, injectable, injectable, UpdateOnboardingStepUseCase, OnboardingProgressController

### Community 260 - "ListQueueController.ts"
Cohesion: 0.28
Nodes (5): ListQueueController, toPublicView(), ListQueueUseCase, inject, injectable

### Community 261 - "CrmController.ts"
Cohesion: 0.46
Nodes (6): campaignSchema, crmCampaignsListSchema, crmClientsSchema, crmForecastSchema, crmPeriodSchema, mergeClientsSchema

### Community 262 - "formRepository.ts"
Cohesion: 0.25
Nodes (7): AddFieldInput, CreateFormInput, formSelect, responseSelect, SubmitResponseInput, UpdateFieldInput, UpdateFormInput

### Community 263 - "productUseCases.ts"
Cohesion: 0.64
Nodes (4): assertUniqueProductCode(), isProductUniqueViolation(), normalizeCode(), throwProductUniqueViolation()

### Community 264 - "resourceRepository.ts"
Cohesion: 0.25
Nodes (7): bookingSelect, CreateBookingInput, CreateResourceInput, resourceSelect, UpdateBookingInput, UpdateResourceInput, resourceTypeMap

### Community 265 - "CancelSubscriptionController.ts"
Cohesion: 0.29
Nodes (4): issueProratedRefundMock, prismaMock, cancelReasonSchema, CancelSubscriptionController

### Community 266 - "proratedRefundService.spec.ts"
Cohesion: 0.29
Nodes (4): abacateMock, asaasMock, mpMock, prismaMock

### Community 267 - "staffRepository.ts"
Cohesion: 0.29
Nodes (6): AssignServiceInput, RequestTimeOffInput, scheduleSelect, serviceSelect, timeOffSelect, UpsertScheduleInput

### Community 268 - "users.routes.ts"
Cohesion: 0.48
Nodes (5): ProfileController, injectable, DeleteAccountController, validateDeleteAccount(), usersRoutes()

### Community 271 - "verifyRecaptcha.ts"
Cohesion: 0.40
Nodes (5): logger, RECAPTCHA_MIN_SCORE, RecaptchaResponse, verifyRecaptcha(), verifyToken()

### Community 273 - "blockedEntitySchemas.ts"
Cohesion: 0.40
Nodes (4): BlockInput, blockSchema, UnblockInput, unblockSchema

### Community 274 - "MeController.ts"
Cohesion: 0.50
Nodes (3): mapRole(), MeController, mePreHandler()

### Community 276 - "enhancedDemandPredictor.ts"
Cohesion: 0.50
Nodes (4): DemandPrediction, WeatherForecastPoint, ConfidenceLevel, EnhancedDemandPrediction

### Community 278 - "wallet.routes.ts"
Cohesion: 0.67
Nodes (3): walletRoutes(), authenticateClient(), extractBearerToken()

## Knowledge Gaps
- **1076 isolated node(s):** `docker-entrypoint.sh script`, `args`, `base`, `token`, `shopId` (+1071 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **79 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `IPaymentDTO.ts` to `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `compilerOptions`, `IBarbershopRepository`, `AppError`, `💈 AgendAI — Backend API`, `IBarbershopResponseDTO`, `normalizeCpf`, `IStorageProvider`, `appointments.spec.ts`, `auth.routes.ts`, `MercadoPagoService`, `IUserResponseDTO`, `IPaymentResponseDTO`, `SubscribeUseCase.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `emailWorker.ts`, `monitor-routes.js`, `index.ts`, `Referência Completa de Rotas`, `referralService.ts`, `index.ts`, `ContactController.ts`, `QueueRepository`, `9. Como Criar um Novo Módulo`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `GetQueueMetricsUseCase`, `ListBarbershopsUseCase.ts`, `ListQueueController.ts`, `13. Regras de Negócio Críticas`, `CheckInAppointmentController.ts`, `6. Sistema de Autenticação e Autorização`, `8. Banco de Dados e Prisma`, `Passo a passo`, `Despesas`, `Pagamentos`, `Fila (Queue)`, `CrmController`, `Admin — Entidades Bloqueadas`, `CrmRepository.ts`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `@fastify/multipart`, `Pentest local — inputs, upload, XSS e exposição pública`, `UpdateBarbershopUseCase`, `RefundPaymentUseCase`, `@testcontainers/postgresql`, `@types/jsonwebtoken`, `app.security.spec.ts`, `AsaasService.ts`, `assertAppointmentBookable.ts`, `ExportUserDataUseCase`, `google-auth-library`, `disposable-email-domains`, `@opentelemetry/resources`, `pino`, `AdminBarbershopController`, `Runbook: Aplicar migrations do backend em Staging/Produção`, `CompleteServiceUseCase.ts`, `index.ts`, `CancelSubscriptionController.ts`, `ProcessAsaasWebhookUseCase.ts`, `ExportFinancialDataUseCase.ts`, `queueDuplicate.ts`, `CheckInAppointmentUseCase.ts`, `notifications.routes.ts`, `ListSubscriptionsController`, `DailyCloseoutController`, `paymentProviderSnapshot.ts`, `GetCrmForecastUseCase`, `RecordActivationEventUseCase`, `reconciliationService.ts`, `CrmController.ts`, `formRepository.ts`, `productUseCases.ts`, `resourceRepository.ts`, `CancelSubscriptionController.ts`, `staffRepository.ts`, `verifyRecaptcha.ts`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **Why does `prisma` connect `IPaymentDTO.ts` to `IFiadoResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `AppError`, `💈 AgendAI — Backend API`, `IBarbershopResponseDTO`, `normalizeCpf`, `IStorageProvider`, `appointments.spec.ts`, `IPlanResponseDTO`, `auth.routes.ts`, `MercadoPagoService`, `RegisterUseCase.ts`, `AgendAI Back‑end — Manual do Sistema`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `emailWorker.ts`, `IPaymentRepository`, `monitor-routes.js`, `Referência Completa de Rotas`, `referralService.ts`, `index.ts`, `.findById`, `IEmailProvider.ts`, `devDependencies`, `QueueRepository`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `ListBarbershopsUseCase.ts`, `ListQueueController.ts`, `13. Regras de Negócio Críticas`, `CheckInAppointmentController.ts`, `PlansController.ts`, `6. Sistema de Autenticação e Autorização`, `8. Banco de Dados e Prisma`, `Passo a passo`, `Despesas`, `Pagamentos`, `CrmController`, `CrmRepository.ts`, `Admin — Usuários`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `@fastify/multipart`, `zod`, `tsup`, `vitest.config.mts`, `sendWhatsAppMessage`, `UpdateBarbershopUseCase`, `RefundPaymentUseCase`, `@types/jsonwebtoken`, `app.security.spec.ts`, `AsaasService.ts`, `ExportUserDataUseCase`, `google-auth-library`, `@opentelemetry/resources`, `pino`, `@fastify/rate-limit`, `CompleteServiceUseCase.ts`, `index.ts`, `CancelSubscriptionController.ts`, `ExportFinancialDataUseCase.ts`, `ListSubscriptionsController`, `DailyCloseoutController`, `GetCrmForecastUseCase`, `RecordActivationEventUseCase`, `LogoutController.ts`, `onboarding.routes.ts`, `CrmController.ts`, `formRepository.ts`, `productUseCases.ts`, `resourceRepository.ts`, `CancelSubscriptionController.ts`, `staffRepository.ts`, `enhancedDemandPredictor.ts`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `IPaymentResponseDTO` connect `CrmController` to `IUserResponseDTO`, `normalizeCpf`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `index.ts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 56 inferred relationships involving `authenticate()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`authenticate()` has 56 INFERRED edges - model-reasoned connections that need verification._
- **Are the 55 inferred relationships involving `setRlsContext()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`setRlsContext()` has 55 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `args`, `base` to the rest of the system?**
  _1076 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14590163934426228 - nodes in this community are weakly interconnected._