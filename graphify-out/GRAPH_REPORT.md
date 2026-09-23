# Graph Report - agendai-back-end  (2026-09-23)

## Corpus Check
- 850 files · ~310,413 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5690 nodes · 13177 edges · 312 communities (226 shown, 86 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 367 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d847ed5a`
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
- catalogTemplates.ts
- WhatsAppConnectionUseCase
- subscribe.spec.ts
- IntegrationRepository
- 14. Integrações Externas
- AdminNotificationController
- .findCareTemplate
- ReputationController
- formRepository.ts
- productUseCases.ts
- resourceRepository.ts
- Auth
- Sistema de Assinaturas
- staffRepository.ts
- .revokeSalonLink
- ShopStatusController.ts
- busboy
- LoyaltyRepository
- @fastify/cookie
- blockedEntitySchemas.ts
- @fastify/helmet
- TicketController
- enhancedDemandPredictor.ts
- @fastify/swagger
- wallet.routes.ts
- @opentelemetry/api
- bcryptjs
- @opentelemetry/instrumentation-redis-4
- pino
- reflect-metadata
- @sentry/profiling-node
- @upstash/redis
- verify-delivery.mjs
- createAppointmentAtomic
- ProfitController
- auth-session.pentest.spec.ts
- TaskController
- GetPaymentStatusUseCase
- payments.routes.ts
- seed.ts
- calendar.routes.ts
- catalogTemplates.ts
- subscribe.spec.ts
- notifications.routes.ts
- WorkSummaryController.ts
- ResetPasswordUseCase
- productsInventory.ts
- cleanOldLogs.cron.ts
- PlansController
- Revisão do lote de e-mails — 2026-09-21
- ws.routes.ts
- queue.routes.ts
- ReputationController
- plans.routes.ts
- categories.routes.ts
- @google-cloud/storage
- @fastify/multipart
- .constructor

## God Nodes (most connected - your core abstractions)
1. `AppError` - 261 edges
2. `prisma` - 207 edges
3. `authenticate()` - 122 edges
4. `setRlsContext()` - 116 edges
5. `authorize()` - 113 edges
6. `checkSubscription()` - 106 edges
7. `apiRoutes()` - 66 edges
8. `checkDashboardAccess()` - 63 edges
9. `getRedisConnection()` - 62 edges
10. `IBarbershopRepository` - 58 edges

## Surprising Connections (you probably didn't know these)
- `qualifyReferralOnPayment()` --indirect_call--> `base()`  [INFERRED]
  src/modules/referrals/services/referralService.ts → src/modules/products/catalogTemplates.ts
- `buildAuthProbeApp()` --indirect_call--> `authenticate()`  [INFERRED]
  src/tests/pentest/auth-session.pentest.spec.ts → src/shared/infra/http/middlewares/authenticate.ts
- `analyticsRoutes()` --indirect_call--> `checkDashboardAccess()`  [INFERRED]
  src/modules/analytics/routes/analytics.routes.ts → src/shared/infra/http/middlewares/checkDashboardAccess.ts
- `scheduleAppointmentReminders()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/cron/appointmentReminders.cron.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `notificationsRoutes()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/http/routes/notifications.routes.ts → src/modules/appointments/useCases/appointmentUseCases.ts

## Import Cycles
- None detected.

## Communities (312 total, 86 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.15
Nodes (58): activationRoutes(), analyticsRoutes(), ActivationController, reviewRoutes(), reviewSchema, cashMovementRoutes(), catalogRoutes(), clientPortalRoutes() (+50 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.14
Nodes (15): acceptInvitationSchema, adminAuditLogQuerySchema, createTaskCommentSchema, createTaskSchema, invitationQuerySchema, inviteTeamMemberSchema, listTasksQuerySchema, listTicketsQuerySchema (+7 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.10
Nodes (19): ProductsController, shopId(), adjustmentSchema, createProductSchema, createReceiptSchema, createRetailSaleSchema, expirationDateSchema, installTemplateSchema (+11 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.06
Nodes (44): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+36 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.05
Nodes (49): forgotPasswordSchema, googleLoginSchema, loginSchema, phoneBR, registerSchema, registerWithGoogleSchema, resetPasswordSchema, scheduleItemSchema (+41 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.12
Nodes (13): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, CreateServiceUseCase, inject (+5 more)

### Community 6 - "index.ts"
Cohesion: 0.04
Nodes (66): createPublicAppointmentToken(), PublicAppointmentPayload, PublicPurpose, readPublicAppointmentToken(), appointmentInstant(), getAppointment(), logger, PublicAppointmentManagementUseCase (+58 more)

### Community 7 - "compilerOptions"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.08
Nodes (44): connectSchema, WhatsAppConnectionController, assertShopAccess(), detachEvolutionInstanceWithTimeout(), ShopWhatsAppDto, ShopWhatsAppStatus, inject, injectable (+36 more)

### Community 9 - "AppError"
Cohesion: 0.07
Nodes (28): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+20 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.08
Nodes (25): ClientPackageController, resolveBarbershopId(), ServicePackageController, BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField (+17 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.16
Nodes (11): IBookPackageSlotDTO, ICreateServicePackageDTO, ISellClientPackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map() (+3 more)

### Community 12 - "normalizeCpf"
Cohesion: 0.10
Nodes (23): assertPaymentProviderEnabled(), EnabledPaymentProvider, enabledPaymentProviders(), IInvoiceResponseDTO, ISubscribeDTO, ISubscriptionResponseDTO, SubscriptionStatus, makeFullSubscription() (+15 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.05
Nodes (35): AuthConfig, refreshSchema, issueAuthSession(), mapRole(), UserLike, findUsableRefreshToken(), RefreshTokenResult, GoogleLoginUseCase (+27 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.15
Nodes (11): ChangeOperationModeController, ChangeOperationModeUseCase, inject, injectable, assertOperationEnabled(), BarbershopMode, Feature, getBarbershopOperationMode() (+3 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.11
Nodes (34): getProcessRole(), shouldRunApi(), shouldRunCrons(), shouldRunWorkers(), VALID_ROLES, CronLog, scheduleCleanupExpiredPix(), CronLog (+26 more)

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
Nodes (14): DeleteLogoUseCase, inject, injectable, GetLogoUploadUrlUseCase, inject, injectable, ALLOWED_MIME_SET, confirmLogoSchema (+6 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.11
Nodes (15): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentRepository, AppointmentWithRelations (+7 more)

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.06
Nodes (19): adapter, defaultPlans, pool, prisma, inject, inject, inject, logger (+11 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.12
Nodes (14): AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput, allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody (+6 more)

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.18
Nodes (10): notifyQueueCapacity(), mocks, JoinQueueController, JoinQueueUseCase, inject, injectable, isQueueStaffForShop(), isPlaceholderWhatsApp() (+2 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.09
Nodes (17): inject, ProcedureRecordController, ICreateProcedureRecordDTO, IProcedureRecordResponseDTO, IUpdateProcedureRecordDTO, IProcedureRecordRepository, ProcedureRecordRepository, assertShopAccess() (+9 more)

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.22
Nodes (17): InventoryEngine, lockProduct(), injectable, Tx, writeMovement(), CatalogProductSnapshot, namesToSkip(), nextStockQty() (+9 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.10
Nodes (19): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, injectable (+11 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.12
Nodes (29): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DEFAULT_PROVIDER_ORDER (+21 more)

### Community 28 - "IQueueRepository"
Cohesion: 0.16
Nodes (14): GetSubscriptionController, loadActivePlans(), SubscriptionEconomicsController, computePlanEconomics(), computePlatformEconomics(), inferBillingCycle(), inferTierKey(), monthsBetween() (+6 more)

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.06
Nodes (21): VisitController, AddItem, CloseTab, CreateVisit, RecordPayment, VisitRepository, visitSelect, addItemSchema (+13 more)

### Community 30 - "queue.spec.ts"
Cohesion: 0.05
Nodes (81): VerifyEmailController, VerifyEmailUseCase, BarbershopEmailSettings, canReceiveEmail(), categoryDefaultEnabled(), categoryForTemplate(), EMAIL_CATEGORY, emailCategoryLabel() (+73 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.21
Nodes (7): JwtPayload, checkDashboardAccess(), getCachedAccess(), setCachedAccess(), financial, requirePermission(), requirePermission()

### Community 32 - "emailWorker.ts"
Cohesion: 0.14
Nodes (10): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+2 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.17
Nodes (8): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.10
Nodes (5): IQueueItemResponseDTO, MockQueueRepository, QueueRepository, IQueueRepository, QueueWaitEstimate

### Community 35 - "monitor-routes.js"
Cohesion: 0.07
Nodes (27): inject, ICreateUserDTO, RoleLiteral, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, IUserResponseDTO, RoleLiteral, MockUserRepository (+19 more)

### Community 36 - "scripts"
Cohesion: 0.07
Nodes (29): scripts, build, db:migrate:status, db:push, db:push:prod, db:studio, db:validate-schema, dev (+21 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.07
Nodes (24): RecordActivationEventUseCase, injectable, buildQueueUpdateMessage(), buildReminderMessage(), calendarDateParts(), createAppointmentAtomic(), FORBIDDEN_TRANSITIONS, formatSaoPauloTime() (+16 more)

### Community 38 - "index.ts"
Cohesion: 0.07
Nodes (14): LoyaltyController, AdjustManualInput, adjustManualSchema, ConfigureLoyaltyProgramInput, configureLoyaltyProgramSchema, RecordCashbackInput, recordCashbackSchema, RecordVisitInput (+6 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.16
Nodes (12): getCatalogTemplate(), assertProductPermission(), canGiveDiscount(), canOverrideProductPrice(), canSeeProductCosts(), COST_PERMISSIONS, isPrivilegedActor(), loadEmployeePermissions() (+4 more)

### Community 40 - "appointmentUseCases.ts"
Cohesion: 0.19
Nodes (7): IMercadoPagoWebhookDTO, ProcessWebhookController, webhookBodySchema, logger, ProcessWebhookUseCase, inject, injectable

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
Cohesion: 0.14
Nodes (19): IBillingAddressDTO, ICardPayerDTO, ICreateCardPaymentDTO, ICreatePixPaymentDTO, IPixQrCodeDTO, PaymentMethod, PaymentProvider, PaymentStatus (+11 more)

### Community 45 - "index.ts"
Cohesion: 0.10
Nodes (26): assertShopAccess(), idSchema, manualStatusSchema, queueStatusSchema, shopPayload(), ShopStatusController, getShopOpenState(), utcDateFromYmd() (+18 more)

### Community 46 - ".findById"
Cohesion: 0.13
Nodes (14): ExpenseCategoryRecord, mapExpenseCategoryToDTO(), mapServiceCategoryToDTO(), ServiceCategoryRecord, ExpenseCategoryRepository, ServiceCategoryRepository, IExpenseCategoryRepository, IServiceCategoryRepository (+6 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.14
Nodes (7): DepositController, ConfirmDepositInput, confirmDepositSchema, DepositListQueryInput, depositListQuerySchema, UpdateDepositPolicyInput, updateDepositPolicySchema

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.12
Nodes (6): ConfirmLogoUseCase, inject, injectable, DeleteAvatarUseCase, inject, injectable

### Community 49 - "devDependencies"
Cohesion: 0.14
Nodes (23): agendaiWordmark(), badge(), buildPostSvg(), escapeXml(), formatBRL(), hoursCard(), LayoutCtx, photoPanel() (+15 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.10
Nodes (15): SupportController, CreateAdminNotificationData, CreateHistoryData, CreateReportData, generateProtocol(), SupportRepository, addCommentSchema, CreateReportInput (+7 more)

### Community 51 - "server.ts"
Cohesion: 0.12
Nodes (16): AdminBarbershopController, adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListBlockedEntitiesQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema (+8 more)

### Community 52 - "QueueRepository"
Cohesion: 0.06
Nodes (19): PurchasingController, AddItemInput, CreateOrderInput, itemSelect, orderSelect, PurchasingRepository, ReceiveOrderInput, UpdateOrderInput (+11 more)

### Community 53 - "GcsStorageProvider"
Cohesion: 0.10
Nodes (21): AgendAI Back‑end — Manual do Sistema, Autenticação e Autorização, Banco de Dados (Prisma), Com Docker, Como Adicionar um Novo Caso de Uso/Endpoint, Convenções, Definições, Dicas para IA (+13 more)

### Community 54 - "9. Como Criar um Novo Módulo"
Cohesion: 0.23
Nodes (9): base(), CATALOG_TEMPLATES, CatalogTemplate, STOCK_EXPENSE, IMPORTANT: Keep in sync with the backfill SQL in, resolveUnitFields(), STOCK_UNIT_LABELS, StockUnit (+1 more)

### Community 55 - "Barbearias"
Cohesion: 0.11
Nodes (14): IGetLogoUploadUrlDTO, IGetLogoUploadUrlResult, ADMIN, otherOwner, IGetAvatarUploadUrlDTO, ALLOWED_LOGO_MIME_TYPES, CloudinaryV2, FallbackStorageProvider (+6 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.10
Nodes (28): buildPostImage(), defaultCtaText(), ENUM_TO_INPUT, loadExternalImageUrl(), loadMediaDataUrl(), loadPostContext(), logger, PostRow (+20 more)

### Community 58 - "AdminDashboardController.ts"
Cohesion: 0.06
Nodes (18): VoucherController, CreateInput, UpdateInput, usageSelect, VoucherRepository, voucherSelect, applyVoucherSchema, createVoucherSchema (+10 more)

### Community 59 - "IAppointmentRepository"
Cohesion: 0.50
Nodes (4): Admin — Assinaturas, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions` 🔒 🛡️ `MASTER_ADMIN`

### Community 60 - "GetQueueMetricsUseCase"
Cohesion: 0.18
Nodes (12): ALLOWED_MIME_SET, logger, UploadVideoController, IUploadVideoDTO, IUploadVideoResult, inject, injectable, UploadVideoUseCase (+4 more)

### Community 61 - "🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI"
Cohesion: 0.08
Nodes (8): AbacatePayService, injectable, AsaasService, injectable, ProratedRefundInput, inject, inject, inject

### Community 62 - "Categorias"
Cohesion: 0.17
Nodes (11): 1. Preparação, 2. Pré-validação, 3. Aplicação, 4. Pós-validação, Escala horizontal, Estado conhecido, Falhas e recuperação, Fluxo de deploy (+3 more)

### Community 63 - "app.ts"
Cohesion: 0.06
Nodes (31): dotenv-cli, devDependencies, dotenv-cli, prisma, @testcontainers/postgresql, tsup, tsx, @types/bcryptjs (+23 more)

### Community 64 - "ListBarbershopsUseCase.ts"
Cohesion: 0.10
Nodes (14): ensureTenant(), PostMediaController, ALLOWED_MIME_SET, AvatarController, confirmAvatarSchema, getUploadUrlSchema, logger, ConfirmAvatarUseCase (+6 more)

### Community 65 - "ListQueueController.ts"
Cohesion: 0.05
Nodes (27): CashMovementController, CashMovementFilters, CashMovementRepository, CreateCashMovementData, CashMovementQueryInput, cashMovementQuerySchema, CashSummaryQueryInput, cashSummaryQuerySchema (+19 more)

### Community 66 - "Google Cloud Storage — setup AgendAI"
Cohesion: 0.50
Nodes (4): Admin — Planos, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/plans` 🔒 🛡️ `MASTER_ADMIN`

### Community 67 - "13. Regras de Negócio Críticas"
Cohesion: 0.06
Nodes (38): FiadoController, FiadoStatus, ICreateFiadoDTO, ICreateFiadoPaymentDTO, IFiadoListQuery, IFiadoPaymentResponseDTO, IFiadoResponseDTO, IFiadoSummary (+30 more)

### Community 68 - "Fiado"
Cohesion: 0.12
Nodes (14): RequestingUser, classifyMaturity(), confidenceInterval(), DemandPrediction, DemandPredictor, FEATURE_NAMES, finite(), MaturityLevel (+6 more)

### Community 70 - "CheckInAppointmentController.ts"
Cohesion: 0.13
Nodes (11): CancelPaymentController, CancelPaymentUseCase, logger, injectable, abacateServiceMock, asaasServiceMock, mockMpCancel, mockMpCard (+3 more)

### Community 71 - "PlansController.ts"
Cohesion: 0.21
Nodes (12): CreateClientRecurringPackageInput, createClientRecurringPackageSchema, CreateRecurringPackagePlanInput, createRecurringPackagePlanSchema, RecordPaymentInput, recordPaymentSchema, RecurringPackageListQueryInput, recurringPackageListQuerySchema (+4 more)

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.50
Nodes (4): Assinaturas, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `GET /subscriptions/me` 🔒, `POST /subscriptions` 🔒 🛡️ `MASTER_ADMIN, OWNER`

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.20
Nodes (11): ExpenseRow, ExpenseWithCategory, FiadoRow, FiadoWithPayments, BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod, normalizeWhatsapp() (+3 more)

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.06
Nodes (13): ProfitController, entrySelect, ProfitRepository, settingsSelect, profitByServiceQuerySchema, profitByStaffQuerySchema, profitComputeSchema, profitManualAdjustmentSchema (+5 more)

### Community 75 - "dependencies"
Cohesion: 0.17
Nodes (5): IPaymentResponseDTO, MockPaymentRepository, mapToDTO(), PaymentRepository, IUpdatePaymentStatusDTO

### Community 76 - "Passo a passo"
Cohesion: 0.15
Nodes (15): setupSwagger(), buildApp(), handleAppError(), correlationIdMiddleware(), registerRoutes(), AUDIT_VALUE_ALLOWLIST, buildSafeAuditDetails(), sanitizeJsonForStorage() (+7 more)

### Community 77 - "Despesas"
Cohesion: 0.18
Nodes (9): ProfileController, inject, injectable, DeleteAccountController, validateDeleteAccount(), DeleteAccountUseCase, inject, injectable (+1 more)

### Community 78 - "Pagamentos"
Cohesion: 0.32
Nodes (6): planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 80 - "7. Sistema de Assinaturas e Bloqueio de CPF"
Cohesion: 0.47
Nodes (8): addMinutes(), isBusinessHour(), isNotPast(), isValidDate(), isValidTime(), isWithinHorizon(), timesOverlap(), ymdInTimeZone()

### Community 81 - "Apêndice B — Endpoints por Role"
Cohesion: 0.12
Nodes (13): mockBarbershopFindUnique, mockBroadcast, mockFeedPostCount, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostFindUnique, mockFeedPostUpdate, mockFeedPostUpdateMany (+5 more)

### Community 82 - "Agendamentos"
Cohesion: 0.16
Nodes (15): CachedWeatherProvider, forecast, redis, MetNoPeriod, MetNoPoint, MetNoWeatherProvider, parseMetNoForecast(), symbolDetails() (+7 more)

### Community 83 - "Fila (Queue)"
Cohesion: 0.20
Nodes (16): catalogListQuerySchema, comboItemSchema, createAddonSchema, createComboSchema, createVariationSchema, updateAddonSchema, updateComboItemSchema, updateComboSchema (+8 more)

### Community 84 - "Serviços"
Cohesion: 0.12
Nodes (17): broadcastPostToClients(), mockEnqueue, mockFindMany, mockFindUnique, enqueuePostBroadcast(), getEvents(), getQueue(), PostBroadcastJobData (+9 more)

### Community 85 - "setup-gcs.sh"
Cohesion: 0.18
Nodes (11): 9. Como Criar um Novo Módulo, Passo 10 — Schema Prisma, Passo 1 — DTOs, Passo 2 — Interface do Repositório, Passo 3 — Mock Repository (para testes), Passo 4 — Implementação Prisma, Passo 5 — Schemas Zod, Passo 6 — UseCases (+3 more)

### Community 86 - "VerifyEmailController.ts"
Cohesion: 0.23
Nodes (5): CreatePackageData, CreatePlanData, RecordPaymentData, RecurringPackageListFilters, UpdatePlanData

### Community 87 - "PlansController"
Cohesion: 0.18
Nodes (10): Achados e correções aplicadas neste ciclo, Casos executáveis (inclusos no plano), Casos manuais → automatizados, Controles validados (sem achado novo), Inventário Graphify, Limitações, PENTEST-AUTH-001 — Authorization sem validação de scheme `Bearer` (corrigido), PENTEST-AUTH-002 — Refresh JWT sem `jti` podia colidir no mesmo segundo (corrigido) (+2 more)

### Community 88 - "StaffUserController"
Cohesion: 0.18
Nodes (11): Barbearias, `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`, Logo — Fluxo via Signed URL (recomendado para produção), Logo — Upload Direto via Multipart (mais simples) (+3 more)

### Community 89 - "CrmController"
Cohesion: 0.22
Nodes (4): MercadoPagoService, injectable, inject, inject

### Community 90 - "14. Integrações Externas"
Cohesion: 0.20
Nodes (10): 12. Erros Comuns e Como Evitá-los, ❌ Converter BigInt para Number, ❌ Esquecer de registrar o repositório no container, ❌ Esquecer `reflect-metadata` no setup de testes, ❌ Importar tipos Prisma do pacote diretamente, ❌ Instanciar Prisma fora de `prismaClient.ts`, ❌ Não registrar rota no `api.ts`, ❌ Passar string de token JWT diretamente em `expiresIn` (+2 more)

### Community 91 - "5. Convenções de Código"
Cohesion: 0.22
Nodes (8): args, base, once, probe(), run(), serviceId, shopId, token

### Community 92 - "Admin — Entidades Bloqueadas"
Cohesion: 0.10
Nodes (11): GoalController, CreateGoalInput, createGoalSchema, dateQueryParam, GoalQueryInput, goalQuerySchema, GoalRankingQueryInput, goalRankingQuerySchema (+3 more)

### Community 93 - "CrmRepository.ts"
Cohesion: 0.22
Nodes (22): emailGalleryRoutes(), generateTemplateHtml(), getAppointmentSamples(), getBodyFn(), sampleDigest(), sampleForgotPassword(), samplePasswordChanged(), samplePaymentApproved() (+14 more)

### Community 94 - "Admin — Usuários"
Cohesion: 0.25
Nodes (11): refreshCrmCampaignStatus(), prismaMock, loadNotificationPayload(), claimAttempt(), completeAttempt(), createWorker(), failAttempt(), isFinalAttempt() (+3 more)

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
Nodes (31): findExisting(), NotificationPayload, NotificationV2Mode, resolveSkipReason(), scheduleNotification(), ScheduleNotificationInput, uniqueKey(), canOwnerConfigureNotification() (+23 more)

### Community 101 - "Assinaturas"
Cohesion: 0.07
Nodes (15): PricingController, CreateInput, PricingRepository, ruleSelect, UpdateInput, createPricingRuleSchema, evaluatePriceSchema, pricingRuleTypeMap (+7 more)

### Community 102 - "Auth"
Cohesion: 0.10
Nodes (15): CompleteAppointmentController, completeAppointmentSchema, CompleteAppointmentRequest, CompleteAppointmentUseCase, ProcedureInput, injectable, retailSalePayloadSchema, channelName() (+7 more)

### Community 104 - "fastify.d.ts"
Cohesion: 0.25
Nodes (7): mockBarbershopFindMany, mockBarbershopUpdate, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostUpdateMany, mockScheduleFindFirst, mockServiceFindMany

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
Cohesion: 0.12
Nodes (8): Claude, dependencies, devDependencies, Inventário de pacotes — Backend (agendai-back-end), Contrato com o frontend, Inventário de scripts — Backend (`agendai-back-end`), Observações críticas, Gemini

### Community 111 - "@fastify/multipart"
Cohesion: 0.13
Nodes (14): CreditInput, DebitInput, entrySelect, TransferInput, walletSelect, creditWalletSchema, debitWalletSchema, transferWalletSchema (+6 more)

### Community 112 - "@fastify/rate-limit"
Cohesion: 0.29
Nodes (7): 6.1 Middlewares disponíveis, 6.2 Combinação padrão de preHandler, 6.3 Roles e permissões, 6.4 Acesso ao usuário no request, 6.5 Autorização em UseCases, 6.6 Token JWT, 6. Sistema de Autenticação e Autorização

### Community 113 - "@fastify/swagger"
Cohesion: 0.29
Nodes (7): 8.1 Instância do Prisma, 8.2 UUIDs, 8.3 Soft delete vs hard delete, 8.4 Enum mapping, 8.5 Migrations vs db push, 8.6 BigInt, 8. Banco de Dados e Prisma

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
Cohesion: 0.23
Nodes (14): barbershopIdQuerySchema, CLIENT_PORTAL_OWNER_ROLES, CLIENT_PORTAL_STAFF_ROLES, clientPortalQuerySchema, confirmLinkSchema, createCareTemplateSchema, linkIdParamsSchema, rejectLinkSchema (+6 more)

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
Cohesion: 0.08
Nodes (27): CronLogger, scheduleDepositExpiration(), getMonitoringDashboard(), hoursAgo(), minutesAgo(), ChargeTrialEndedSubscriptionsUseCase, injectable, CronLogger (+19 more)

### Community 128 - "tsup"
Cohesion: 0.17
Nodes (16): getNotificationV2Mode(), getNotificationOperationsHealth(), heartbeatStatus(), ProcessRole, dispatchBatch(), dispatchNotificationOutboxNow(), logger, nextBackoff() (+8 more)

### Community 130 - "@types/bcryptjs"
Cohesion: 0.05
Nodes (4): ClientPortalRepository, ClientPortalRepositoryInstance, generateOtpCode(), normalizePhone()

### Community 131 - "@types/node"
Cohesion: 0.03
Nodes (63): sensitiveRoutes, adapter, hasSslMode, pool, prisma, prismaMock, UpdateTaskUseCase, VALID_TASK_TRANSITIONS (+55 more)

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
Cohesion: 0.14
Nodes (11): DeleteQueueItemController, DeleteQueueItemUseCase, inject, injectable, ALLOWED_TRANSITIONS, assertQueueStatusTransition(), assertQueueTenantAccess(), logger (+3 more)

### Community 142 - "GoogleLoginUseCase"
Cohesion: 0.50
Nodes (4): Financeiro da Barbearia, `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋

### Community 145 - "sendWhatsAppMessage"
Cohesion: 0.14
Nodes (19): header(), RawBodyRequest, ResendWebhookController, resendWebhookPreParsing(), recordTerminalNotificationFailure(), sanitizeNotificationError(), addSuppression(), applyEmailEvent() (+11 more)

### Community 146 - "Pentest local — inputs, upload, XSS e exposição pública"
Cohesion: 0.06
Nodes (12): WhatsAppAiController, normalizePhone(), WhatsAppAiRepository, intentLogsSchema, listConversationsSchema, processIncomingMessageSchema, detectIntent(), generateResponse() (+4 more)

### Community 147 - "UpdateBarbershopUseCase"
Cohesion: 0.10
Nodes (10): FiscalController, FiscalConfigInput, fiscalConfigSchema, FiscalStatsQueryInput, fiscalStatsQuerySchema, IssueNfeInput, issueNfeSchema, NfeQueryInput (+2 more)

### Community 148 - "QueueRepository"
Cohesion: 0.19
Nodes (18): createEquipmentSchema, createMovementSchema, createNeedSchema, dashboardQuerySchema, equipmentListQuerySchema, movementListQuerySchema, needListQuerySchema, updateEquipmentSchema (+10 more)

### Community 152 - "RefundPaymentUseCase"
Cohesion: 0.17
Nodes (11): 1. Criar conta no Cloudinary, 2. Copiar credenciais, 3. Adicionar ao `.env`, 4. (Opcional) Criar pasta folders, Cloudinary — Fallback de Storage AgendAI, Como funciona o fallback, Comportamento por cenário, Notas técnicas (+3 more)

### Community 153 - "cancelSubscription.spec.ts"
Cohesion: 0.14
Nodes (11): CrmForecastDTO, ICrmRepository, CrmPermission, CrmUser, GetCrmClientUseCase, GetCrmForecastUseCase, GetCrmOverviewUseCase, ListCrmClientsUseCase (+3 more)

### Community 154 - "PENTEST_REPORT_TEMPLATE.md"
Cohesion: 0.05
Nodes (39): bcryptjs, bullmq, cloudinary, disposable-email-domains, fastify, @fastify/cors, @fastify/swagger-ui, @fastify/websocket (+31 more)

### Community 155 - "fastify"
Cohesion: 0.09
Nodes (6): OrganizationController, createOrganizationSchema, inviteMemberSchema, updateMemberRoleSchema, updateOrganizationSchema, OrganizationUseCases

### Community 156 - "@prisma/adapter-pg"
Cohesion: 0.25
Nodes (4): assertSameBarbershop(), assertShopWhatsAppConnected(), PostsController, toPostResponse()

### Community 157 - "@testcontainers/postgresql"
Cohesion: 0.07
Nodes (21): createBarbershopSchema, phoneBR, scheduleItemSchema, updateBarbershopSchema, updateScheduleSchema, CreateBarbershopController, CreateBarbershopUseCase, inject (+13 more)

### Community 160 - "AdminDashboardController.ts"
Cohesion: 0.25
Nodes (6): AdminFinancialController, EnrichedBarbershop, ExpenseRow, FiadoRow, FiadoSummaryRow, remainingFiado()

### Community 163 - "AsaasService.ts"
Cohesion: 0.25
Nodes (4): DeleteServiceController, DeleteServiceUseCase, inject, injectable

### Community 166 - "ExportUserDataUseCase"
Cohesion: 0.13
Nodes (8): ReputationRepository, reputationSelect, RespondInput, reviewResponseSelect, reputationQuerySchema, respondToReviewSchema, ReputationUseCases, RespondInput

### Community 167 - "AdminNotificationController.ts"
Cohesion: 0.18
Nodes (6): CrmController, resolveCampaignClientIds(), resolveShop(), { findUnique }, assertCrmAccess(), BackfillCrmUseCase

### Community 168 - "AdminNotificationController"
Cohesion: 0.07
Nodes (25): AppointmentController, executeSlots, availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR (+17 more)

### Community 169 - "google-auth-library"
Cohesion: 0.13
Nodes (8): CopilotRepository, suggestionSelect, acceptSchema, copilotSuggestionTypeMap, dismissSchema, listSuggestionsSchema, markReadSchema, ListQuery

### Community 171 - "JoinQueueController.ts"
Cohesion: 0.11
Nodes (17): BusinessSegment, IBarbershopResponseDTO, ManualShopStatus, OpeningMode, OperationMode, ShopOpenStateDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO (+9 more)

### Community 173 - "@opentelemetry/resources"
Cohesion: 0.25
Nodes (4): DeleteBarbershopController, DeleteBarbershopUseCase, inject, injectable

### Community 174 - "@opentelemetry/sdk-node"
Cohesion: 0.28
Nodes (4): createServiceSchema, updateServiceSchema, CreateServiceController, UpdateServiceController

### Community 176 - "pino"
Cohesion: 0.39
Nodes (6): CronLogger, fetchOpenMeteoLogDay(), finite(), getForecastForDate(), populateDailyWeatherLog(), scheduleDailyWeatherLog()

### Community 177 - "@sentry/node"
Cohesion: 0.19
Nodes (8): assertOwner(), assertPackageBookable(), assertShopAccess(), batchSlotsOverlap(), IBatchSlot, overlaps(), timeToMinutes(), debitClientPackageInTx()

### Community 181 - "ForgotPasswordUseCase"
Cohesion: 0.19
Nodes (16): backfillCrmLedger(), EventInput, recordAppointmentCompletion(), recordCrmFinancialEvent(), recordFiadoCreated(), recordFiadoPayment(), recordPackageSale(), recordQueueCompletion() (+8 more)

### Community 182 - "payments.routes.ts"
Cohesion: 0.22
Nodes (9): Fiado / despesas / comissões, Fila / agenda / híbrido, Notificações, Pacotes, Pagamentos, Produtos / estoque / retail, Regras de negócio — Backend, Tenant, permissões, RLS (+1 more)

### Community 184 - "AdminBarbershopController"
Cohesion: 0.19
Nodes (16): addFieldSchema, createFormSchema, formFieldTypeEnum, formListQuerySchema, formResponseListQuerySchema, formTypeEnum, submitResponseSchema, updateFieldSchema (+8 more)

### Community 186 - "bruteForceProtection.spec.ts"
Cohesion: 0.14
Nodes (9): EquipmentInput, equipments, MockEquip, MockMovement, MockNeed, mockRepo, movements, NeedInput (+1 more)

### Community 187 - "@fastify/rate-limit"
Cohesion: 0.33
Nodes (4): mockGetById, mockGetPublishedById, mockListPublished, mockRecordEvent

### Community 188 - "@google-cloud/storage"
Cohesion: 0.22
Nodes (8): Backup do Render, Cutover, Migração PostgreSQL Render → Supabase, Preparação do Supabase, Reconciliação obrigatória, Regras de segurança, Rollback, Variáveis

### Community 189 - "pg"
Cohesion: 0.07
Nodes (25): barbershopId(), IntegrationController, asaasConfig, configSchemas, createIntegrationSchema, credentialSchemas, evolutionApiConfig, googleCalendarConfig (+17 more)

### Community 190 - "@upstash/redis"
Cohesion: 0.40
Nodes (4): AUTH_AND_HIDDEN_KEYS, findFirst, findMany, findUnique

### Community 191 - "Runbook: Aplicar migrations do backend em Staging/Produção"
Cohesion: 0.14
Nodes (13): CreateEquipmentInput, CreateMovementInput, CreateNeedInput, equipmentSelect, movementSelect, needSelect, UpdateEquipmentInput, UpdateNeedInput (+5 more)

### Community 200 - "CompleteServiceUseCase.ts"
Cohesion: 0.21
Nodes (8): ACTIVE_STATUSES, ALL_STATUSES, ListQueueController, resolveStatuses(), toPublicView(), ListQueueUseCase, inject, injectable

### Community 202 - "assertOperationEnabled.ts"
Cohesion: 0.10
Nodes (13): GetBarbershopController, GetBarbershopUseCase, inject, injectable, ListPublicStaffUseCase, PublicStaffMember, inject, injectable (+5 more)

### Community 203 - "index.ts"
Cohesion: 0.17
Nodes (11): ICommissionEntryDTO, ICommissionSplitDTO, ICommissionSummary, IListCommissionsQuery, CommissionRepository, CommissionWithRelations, dateFilter(), include (+3 more)

### Community 204 - "CancelSubscriptionController.ts"
Cohesion: 0.22
Nodes (10): IJoinQueueDTO, QueueStatus, IUpdateQueueItemDTO, PrismaQueueStatus, toDTO(), toPrisma(), computeIdentityKey(), digits() (+2 more)

### Community 205 - "check-docs.mjs"
Cohesion: 0.25
Nodes (5): entryFiles, errors, modulesDir, pkg, root

### Community 206 - "ProcessAsaasWebhookUseCase.ts"
Cohesion: 0.16
Nodes (8): ExpenseCategoryController, expenseCatRepo, ServiceCategoryController, serviceCatRepo, createExpenseCategorySchema, createServiceCategorySchema, updateExpenseCategorySchema, updateServiceCategorySchema

### Community 207 - "ExportFinancialDataUseCase.ts"
Cohesion: 0.26
Nodes (6): WorkSummaryController, GetWorkSummaryUseCase, validateSchema(), protectLastAdmin(), adminInternalRoutes(), internalGuards

### Community 208 - "resendWebhookService.ts"
Cohesion: 0.15
Nodes (11): IRegisterDTO, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate, mockTxScheduleCreateMany (+3 more)

### Community 209 - "GetPaymentStatusUseCase"
Cohesion: 0.11
Nodes (11): IPaymentRepository, inject, allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessAsaasWebhookUseCase, inject (+3 more)

### Community 210 - "AGENTS.md — AgendAI Backend"
Cohesion: 0.18
Nodes (11): 0. Regras essenciais, 1. O que é esta API, 2. Inventários locais, 3. Comandos frequentes, 5. Checklist de mudança, 6. Bugs conhecidos fora de escopo, AGENTS.md — AgendAI Backend, ⚠️ Cuidado: Queries com comparação entre colunas (+3 more)

### Community 211 - "IPaymentRepository"
Cohesion: 0.16
Nodes (13): AttentionItem, AttentionProductSnap, AttentionPurpose, AttentionSaleRow, buildProductAttention(), daysOfCover(), periodDays(), ProductAttention (+5 more)

### Community 212 - "Arquitetura backend — Clean Architecture e SOLID"
Cohesion: 0.33
Nodes (5): Arquitetura backend — Clean Architecture e SOLID, Fluxo de execução vs direção das dependências, Responsabilidades, SOLID (exemplos locais), Transações

### Community 213 - "queueDuplicate.ts"
Cohesion: 0.09
Nodes (23): updateQueueItemSchema, buildQueueCalledMessage(), buildQueueCancelledMessage(), buildQueueJoinedMessage(), logger, notifyCustomerJoinedQueue(), NotifyQueuePositionResult, NotifyQueuePositionUpdatesUseCase (+15 more)

### Community 214 - "Estrutura — Backend (`agendai-back-end`)"
Cohesion: 0.23
Nodes (7): CrmCampaignListItem, CrmClientMetrics, CrmOverviewDTO, CrmSegment, buildClientMetrics(), CrmRepository, segmentFor()

### Community 216 - "CheckInAppointmentUseCase.ts"
Cohesion: 0.24
Nodes (11): assignServiceSchema, deleteScheduleSchema, removeServiceSchema, requestTimeOffSchema, timeOffQuerySchema, timeOffStatusEnum, upsertScheduleSchema, AssignServiceInput (+3 more)

### Community 219 - "verifyRecaptcha.ts"
Cohesion: 0.16
Nodes (6): TreeNode, TreeOptions, SeasonalDecomposition, correlation(), mean(), std()

### Community 220 - "ResetPasswordUseCase"
Cohesion: 0.27
Nodes (4): BarbershopFinancialController, GetWeatherInsightsUseCase, inject, injectable

### Community 221 - "notifications.routes.ts"
Cohesion: 0.29
Nodes (10): createShowcaseEntrySchema, showcaseEventQuerySchema, showcaseListQuerySchema, showcaseOrderSchema, updateShowcaseEntrySchema, CreateInput, EventQuery, ListQuery (+2 more)

### Community 223 - "seed.ts"
Cohesion: 0.24
Nodes (4): GetQueueMetricsController, GetQueueMetricsUseCase, inject, injectable

### Community 224 - "Auth"
Cohesion: 0.20
Nodes (5): walletRoutes(), authenticateClient(), extractBearerToken(), randomToken(), tokenDigest()

### Community 228 - "ListSubscriptionsController"
Cohesion: 0.25
Nodes (7): A12 pricing + catalog, A13 purchasing ↔ InventoryEngine, A14 corporate, Contrato / WIP, Onda 3 (altos), P0 / dinheiro e takeover, Status da auditoria 15–16/09/2026

### Community 237 - "GetWeatherForecastUseCase.ts"
Cohesion: 0.36
Nodes (8): checkDatabase(), checkMigrations(), checkRedis(), healthRoutes(), getStorageHealthStatus(), isCloudinaryConfigured(), isGcsConfigured(), StorageHealthStatus

### Community 241 - "@opentelemetry/instrumentation-fastify"
Cohesion: 0.33
Nodes (5): Estrutura — Backend (`agendai-back-end`), Middlewares, Módulos (`src/modules/`), Providers / integrações (arquivos), Rotas HTTP (`shared/infra/http/routes/`)

### Community 242 - "ChargeTrialEndedSubscriptionsUseCase"
Cohesion: 0.19
Nodes (15): productTypeWhere(), enrichExpiration(), ProductListItem, stripCost(), assertUniqueProductCode(), isProductUniqueViolation(), normalizeCode(), throwProductUniqueViolation() (+7 more)

### Community 244 - "GetCrmForecastUseCase"
Cohesion: 0.20
Nodes (9): addonSelect, comboSelect, CreateAddon, CreateCombo, CreateVariation, UpdateAddon, UpdateCombo, UpdateVariation (+1 more)

### Community 246 - "RecordActivationEventUseCase"
Cohesion: 0.25
Nodes (7): CreateInput, entrySelect, publicEntrySelect, UpdateInput, imageAuthorizationMap, showcaseModeMap, showcaseStatusMap

### Community 247 - "reconciliationService.ts"
Cohesion: 0.16
Nodes (9): GetWeatherForecastController, GetWeatherForecastUseCase, RequestingUser, inject, injectable, cache, Location, pending (+1 more)

### Community 249 - "ExportFinancialDataUseCase"
Cohesion: 0.22
Nodes (5): DailyLimitExceededError, GeneratePostInput, baseInput, mockRedisGet, mockRedisSet

### Community 255 - "WhatsAppConnectionUseCase"
Cohesion: 0.29
Nodes (7): 1. Projeto GCP, 2. Variáveis no `.env`, 3. Criar Service Account + chave JSON, 4. Bucket, CORS, IAM público e pastas, 5. Rodar a API, 6. Smoke test, Passo a passo

### Community 256 - "subscribe.spec.ts"
Cohesion: 0.32
Nodes (6): getPostPalette(), isValidPaletteKey(), listPostPalettes(), PALETTE_BY_KEY, POST_PALETTES, PostPalette

### Community 257 - "IntegrationRepository"
Cohesion: 0.40
Nodes (5): 11.1 Configuração, 11.2 Padrão de teste, 11.3 Executar testes, 11.4 O que deve ser testado, 11. Testes

### Community 258 - "14. Integrações Externas"
Cohesion: 0.31
Nodes (6): onboardingRoutes(), GetOnboardingUseCase, injectable, injectable, UpdateOnboardingStepUseCase, OnboardingProgressController

### Community 261 - "ReputationController"
Cohesion: 0.16
Nodes (8): GetPaymentStatusController, GetPaymentStatusUseCase, inject, injectable, ListPaymentsController, ListPaymentsUseCase, inject, injectable

### Community 262 - "formRepository.ts"
Cohesion: 0.25
Nodes (7): AddFieldInput, CreateFormInput, formSelect, responseSelect, SubmitResponseInput, UpdateFieldInput, UpdateFormInput

### Community 263 - "productUseCases.ts"
Cohesion: 0.29
Nodes (4): ListServicesController, ListServicesUseCase, inject, injectable

### Community 264 - "resourceRepository.ts"
Cohesion: 0.33
Nodes (6): Apêndice B — Endpoints por Role, MASTER_ADMIN only, OWNER + EMPLOYEE + MASTER_ADMIN, OWNER + MASTER_ADMIN, OWNER only, Público (sem autenticação)

### Community 265 - "Auth"
Cohesion: 0.46
Nodes (6): campaignSchema, crmCampaignsListSchema, crmClientsSchema, crmForecastSchema, crmPeriodSchema, mergeClientsSchema

### Community 266 - "Sistema de Assinaturas"
Cohesion: 0.36
Nodes (4): CancellationContextController, CancellationContextResult, CancellationContextUseCase, emptyContext()

### Community 267 - "staffRepository.ts"
Cohesion: 0.29
Nodes (6): AssignServiceInput, RequestTimeOffInput, scheduleSelect, serviceSelect, timeOffSelect, UpsertScheduleInput

### Community 268 - ".revokeSalonLink"
Cohesion: 0.43
Nodes (5): AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period

### Community 273 - "blockedEntitySchemas.ts"
Cohesion: 0.05
Nodes (58): AdminUserController, logger, RegisterUseCase, injectable, IRegisterGoogleDTO, logger, RegisterGoogleUseCase, BASE_INPUT (+50 more)

### Community 276 - "enhancedDemandPredictor.ts"
Cohesion: 0.40
Nodes (5): 14.0 E-mail (Resend) + Indicação, 14.1 Mercado Pago, 14.2 Google Cloud Storage, 14.3 Variáveis de Ambiente Obrigatórias em Produção, 14. Integrações Externas

### Community 278 - "wallet.routes.ts"
Cohesion: 0.40
Nodes (4): Checkout de assinatura (implementado), Domínios → persistência (visão), Mapa de domínio — Backend, Testes

### Community 287 - "createAppointmentAtomic"
Cohesion: 0.50
Nodes (3): Comandos, Graphify — Backend, Procedimento obrigatório

### Community 288 - "ProfitController"
Cohesion: 0.50
Nodes (4): Auth, `GET /auth/me` 🔒, `POST /auth/login`, `POST /auth/refresh`

### Community 289 - "auth-session.pentest.spec.ts"
Cohesion: 0.38
Nodes (5): csvCell(), ExportFinancialDataUseCase, ExportRequest, maskName(), injectable

### Community 290 - "TaskController"
Cohesion: 0.29
Nodes (4): abacateMock, asaasMock, mpMock, prismaMock

### Community 291 - "GetPaymentStatusUseCase"
Cohesion: 0.50
Nodes (4): Fluxo de assinatura, Sistema de Assinaturas, Status de assinatura, Trial

### Community 292 - "payments.routes.ts"
Cohesion: 0.33
Nodes (5): abacateWebhookPreParsing(), ListRefundsController, checkoutRateLimit, paymentRoutes(), webhookRateLimit

### Community 293 - "seed.ts"
Cohesion: 0.20
Nodes (7): createTicketCommentSchema, createTicketSchema, updateTicketSchema, CreateTicketUseCase, generateProtocol(), GetTicketUseCase, ListTicketsUseCase

### Community 294 - "calendar.routes.ts"
Cohesion: 0.09
Nodes (20): BlockedEntityAdminController, blockSchema, calendarRoutes(), id, policySchema, shopId(), blockOwnerCpfs(), unblockOwnerCpfs() (+12 more)

### Community 295 - "catalogTemplates.ts"
Cohesion: 0.33
Nodes (4): GetServiceController, GetServiceUseCase, inject, injectable

### Community 296 - "subscribe.spec.ts"
Cohesion: 0.38
Nodes (6): checkLock(), getLockDuration(), getRemainingTTL(), lockTimers, logger, recordFailure()

### Community 297 - "notifications.routes.ts"
Cohesion: 0.38
Nodes (6): retryNotification(), listSchema, notificationsRoutes(), ownerShop(), preferencesSchema, whatsappBodySchema

### Community 298 - "WorkSummaryController.ts"
Cohesion: 0.10
Nodes (13): AdminAuditLogController, AdminNotificationController, AdminReferralsController, verifyInternalAdmin(), auditLogController, barbershopController, blockedEntityController, dashboardController (+5 more)

### Community 299 - "ResetPasswordUseCase"
Cohesion: 0.83
Nodes (3): ALLOWED_TABLES, cleanTable(), scheduleCleanOldLogs()

### Community 300 - "productsInventory.ts"
Cohesion: 0.40
Nodes (3): listPostTemplates(), POST_TEMPLATES, TemplateGroup

### Community 301 - "cleanOldLogs.cron.ts"
Cohesion: 0.40
Nodes (3): insideRlsTx, rlsExtension, RequestContext

### Community 305 - "queue.routes.ts"
Cohesion: 0.53
Nodes (3): extractBearerToken(), authenticateOptional(), JwtPayload

## Knowledge Gaps
- **1210 isolated node(s):** `docker-entrypoint.sh script`, `args`, `base`, `token`, `shopId` (+1205 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **86 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `@types/node` to `api.ts`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `IBarbershopRepository`, `AppError`, `💈 AgendAI — Backend API`, `IBarbershopResponseDTO`, `normalizeCpf`, `IStorageProvider`, `appointments.spec.ts`, `auth.routes.ts`, `MercadoPagoService`, `IUserResponseDTO`, `IPaymentDTO.ts`, `IPaymentResponseDTO`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `LogoController.ts`, `emailWorker.ts`, `monitor-routes.js`, `planEconomics.ts`, `index.ts`, `Referência Completa de Rotas`, `referralService.ts`, `index.ts`, `ContactController.ts`, `CreateBarbershopUseCase`, `server.ts`, `QueueRepository`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `GetQueueMetricsUseCase`, `ListBarbershopsUseCase.ts`, `ListQueueController.ts`, `13. Regras de Negócio Críticas`, `Fiado`, `CheckInAppointmentController.ts`, `PlansController.ts`, `6. Sistema de Autenticação e Autorização`, `8. Banco de Dados e Prisma`, `Passo a passo`, `Pagamentos`, `Fila (Queue)`, `VerifyEmailController.ts`, `Admin — Entidades Bloqueadas`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `Auth`, `@fastify/multipart`, `@prisma/client`, `vitest.config.mts`, `Pentest local — inputs, upload, XSS e exposição pública`, `UpdateBarbershopUseCase`, `QueueRepository`, `cancelSubscription.spec.ts`, `@testcontainers/postgresql`, `AdminDashboardController.ts`, `ExportUserDataUseCase`, `AdminNotificationController`, `google-auth-library`, `JoinQueueController.ts`, `ForgotPasswordUseCase`, `AdminBarbershopController`, `bruteForceProtection.spec.ts`, `@fastify/rate-limit`, `pg`, `Runbook: Aplicar migrations do backend em Staging/Produção`, `assertOperationEnabled.ts`, `CancelSubscriptionController.ts`, `ProcessAsaasWebhookUseCase.ts`, `queueDuplicate.ts`, `Estrutura — Backend (`agendai-back-end`)`, `CheckInAppointmentUseCase.ts`, `notifications.routes.ts`, `Auth`, `ChargeTrialEndedSubscriptionsUseCase`, `GetCrmForecastUseCase`, `RecordActivationEventUseCase`, `reconciliationService.ts`, `AdminNotificationController`, `ReputationController`, `formRepository.ts`, `Auth`, `Sistema de Assinaturas`, `staffRepository.ts`, `blockedEntitySchemas.ts`, `auth-session.pentest.spec.ts`, `calendar.routes.ts`, `catalogTemplates.ts`, `notifications.routes.ts`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Why does `prisma` connect `@types/node` to `api.ts`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `AppError`, `IBarbershopResponseDTO`, `normalizeCpf`, `IStorageProvider`, `appointments.spec.ts`, `IPlanResponseDTO`, `auth.routes.ts`, `MercadoPagoService`, `RegisterUseCase.ts`, `IPaymentDTO.ts`, `SubscribeUseCase.ts`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `LogoController.ts`, `emailWorker.ts`, `IPaymentRepository`, `monitor-routes.js`, `planEconomics.ts`, `Referência Completa de Rotas`, `referralService.ts`, `index.ts`, `.findById`, `devDependencies`, `CreateBarbershopUseCase`, `server.ts`, `QueueRepository`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `ListBarbershopsUseCase.ts`, `ListQueueController.ts`, `13. Regras de Negócio Críticas`, `Fiado`, `6. Sistema de Autenticação e Autorização`, `8. Banco de Dados e Prisma`, `Passo a passo`, `Pagamentos`, `VerifyEmailController.ts`, `Admin — Usuários`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `Auth`, `@fastify/multipart`, `zod`, `tsup`, `sendWhatsAppMessage`, `cancelSubscription.spec.ts`, `AdminDashboardController.ts`, `ExportUserDataUseCase`, `google-auth-library`, `JoinQueueController.ts`, `pino`, `ForgotPasswordUseCase`, `Runbook: Aplicar migrations do backend em Staging/Produção`, `assertOperationEnabled.ts`, `index.ts`, `CancelSubscriptionController.ts`, `ExportFinancialDataUseCase.ts`, `IPaymentRepository`, `Estrutura — Backend (`agendai-back-end`)`, `Auth`, `GetWeatherForecastUseCase.ts`, `ChargeTrialEndedSubscriptionsUseCase`, `GetCrmForecastUseCase`, `RecordActivationEventUseCase`, `14. Integrações Externas`, `formRepository.ts`, `Auth`, `Sistema de Assinaturas`, `staffRepository.ts`, `.revokeSalonLink`, `blockedEntitySchemas.ts`, `auth-session.pentest.spec.ts`, `seed.ts`, `calendar.routes.ts`, `notifications.routes.ts`, `ResetPasswordUseCase`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `EquipmentController` connect `subscribe.spec.ts` to `QueueRepository`, `LogoController.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 58 inferred relationships involving `authenticate()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`authenticate()` has 58 INFERRED edges - model-reasoned connections that need verification._
- **Are the 57 inferred relationships involving `setRlsContext()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`setRlsContext()` has 57 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `args`, `base` to the rest of the system?**
  _1210 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14553990610328638 - nodes in this community are weakly interconnected._