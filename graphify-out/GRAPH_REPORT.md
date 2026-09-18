# Graph Report - agendai-back-end  (2026-09-18)

## Corpus Check
- 790 files · ~278,381 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5364 nodes · 12296 edges · 293 communities (217 shown, 76 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 361 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e443b606`
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
- ReputationController
- formRepository.ts
- productUseCases.ts
- resourceRepository.ts
- Auth
- Sistema de Assinaturas
- staffRepository.ts
- busboy
- verifyRecaptcha.ts
- @fastify/cookie
- blockedEntitySchemas.ts
- @fastify/helmet
- ReputationController
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

## God Nodes (most connected - your core abstractions)
1. `AppError` - 243 edges
2. `prisma` - 181 edges
3. `authenticate()` - 119 edges
4. `setRlsContext()` - 113 edges
5. `authorize()` - 112 edges
6. `checkSubscription()` - 108 edges
7. `checkDashboardAccess()` - 65 edges
8. `apiRoutes()` - 63 edges
9. `getRedisConnection()` - 60 edges
10. `IBarbershopRepository` - 58 edges

## Surprising Connections (you probably didn't know these)
- `qualifyReferralOnPayment()` --indirect_call--> `base()`  [INFERRED]
  src/modules/referrals/services/referralService.ts → src/modules/products/catalogTemplates.ts
- `scheduleAppointmentReminders()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/cron/appointmentReminders.cron.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `notificationsRoutes()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/http/routes/notifications.routes.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `crmRoutes()` --indirect_call--> `ExportFinancialDataUseCase`  [INFERRED]
  src/shared/infra/http/routes/crm.routes.ts → src/modules/crm/useCases/exportFinancialData/ExportFinancialDataUseCase.ts
- `monitoringRoutes()` --indirect_call--> `getMonitoringDashboard()`  [INFERRED]
  src/modules/monitoring/monitoringRoutes.ts → src/modules/monitoring/monitoringController.ts

## Import Cycles
- None detected.

## Communities (293 total, 76 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.05
Nodes (120): AuthConfig, insideRlsTx, rlsExtension, AdminAuditLogController, AdminReferralsController, activationRoutes(), analyticsRoutes(), ActivationController (+112 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.10
Nodes (12): FiadoController, IFiadoRepository, AddFiadoPaymentUseCase, CreateFiadoUseCase, DeleteFiadoUseCase, GetFiadoSummaryUseCase, GetFiadoUseCase, ListFiadosUseCase (+4 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.11
Nodes (16): ProductsController, shopId(), adjustmentSchema, createProductSchema, createReceiptSchema, createRetailSaleSchema, installTemplateSchema, listProductsQuerySchema (+8 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.06
Nodes (40): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+32 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.07
Nodes (27): CrmController, resolveCampaignClientIds(), resolveShop(), CrmCampaignListItem, CrmClientMetrics, CrmOverviewDTO, CrmSegment, buildClientMetrics() (+19 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.17
Nodes (6): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository

### Community 6 - "index.ts"
Cohesion: 0.07
Nodes (33): allowlist(), buildPaymentProviderSnapshot(), parsePayload(), SAFE_KEYS, computeProratedAmount(), findApprovedPayment(), getProratedRefundInfo(), issueProratedRefund() (+25 more)

### Community 7 - "compilerOptions"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.11
Nodes (25): connectSchema, WhatsAppConnectionController, assertShopAccess(), detachEvolutionInstanceWithTimeout(), ShopWhatsAppDto, ShopWhatsAppStatus, inject, injectable (+17 more)

### Community 9 - "AppError"
Cohesion: 0.07
Nodes (29): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+21 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.07
Nodes (27): ClientPackageController, resolveBarbershopId(), ServicePackageController, BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField (+19 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.21
Nodes (8): ICreateServicePackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map(), ServicePackageRepository, IServicePackageRepository

### Community 12 - "normalizeCpf"
Cohesion: 0.09
Nodes (11): AbacatePayService, injectable, inject, inject, ISubscribeDTO, SubscribeController, frontendBaseUrl(), SubscribeUseCase (+3 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.10
Nodes (21): issueAuthSession(), mapRole(), UserLike, findUsableRefreshToken(), RefreshTokenResult, LogoutController, LogoutUseCase, mockDeleteMany (+13 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.18
Nodes (13): OperationMode, ChangeOperationModeController, ChangeOperationModeDTO, ChangeOperationModeResult, ChangeOperationModeUseCase, injectable, assertOperationEnabled(), BarbershopMode (+5 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.13
Nodes (28): scheduleWaitlistExpiration(), getProcessRole(), shouldRunApi(), shouldRunCrons(), shouldRunWorkers(), VALID_ROLES, ALLOWED_TABLES, cleanTable() (+20 more)

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
Cohesion: 0.09
Nodes (16): AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput, AsaasBillingType, AsaasCustomer, AsaasPayment (+8 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.12
Nodes (14): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentRepository, AppointmentWithRelations (+6 more)

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.05
Nodes (31): sensitiveRoutes, adapter, hasSslMode, pool, prisma, EnrichedBarbershop, ExpenseRow, FiadoRow (+23 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.10
Nodes (18): allowDevModeWebhooks(), ProcessAbacateWebhookUseCase, skipApiVerification(), injectable, ProcessAsaasWebhookUseCase, injectable, qualifyReferralOnPayment(), assertTransition() (+10 more)

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.17
Nodes (18): availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR, slotsQuerySchema, timeField (+10 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.10
Nodes (16): ProcedureRecordController, ICreateProcedureRecordDTO, IProcedureRecordResponseDTO, IUpdateProcedureRecordDTO, IProcedureRecordRepository, ProcedureRecordRepository, assertShopAccess(), assertStaffRole() (+8 more)

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.16
Nodes (11): IBookPackageSlotDTO, assertOwner(), assertPackageBookable(), assertShopAccess(), RequestingUser, batchSlotsOverlap(), IBatchSlot, overlaps() (+3 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.10
Nodes (19): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, injectable (+11 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.09
Nodes (34): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DailyLimitExceededError (+26 more)

### Community 28 - "IQueueRepository"
Cohesion: 0.09
Nodes (26): assertPaymentProviderEnabled(), EnabledPaymentProvider, enabledPaymentProviders(), IInvoiceResponseDTO, ISubscriptionResponseDTO, SubscriptionStatus, CancellationContextController, CancellationContextResult (+18 more)

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.06
Nodes (21): VisitController, AddItem, CloseTab, CreateVisit, RecordPayment, VisitRepository, visitSelect, addItemSchema (+13 more)

### Community 30 - "queue.spec.ts"
Cohesion: 0.07
Nodes (35): googleLoginSchema, registerSchema, GoogleLoginController, validateGoogleLogin, LoginController, validateLogin, LoginUseCase, injectable (+27 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.10
Nodes (16): createBarbershopSchema, phoneBR, scheduleItemSchema, updateBarbershopSchema, updateScheduleSchema, CreateBarbershopController, CreateBarbershopUseCase, inject (+8 more)

### Community 32 - "emailWorker.ts"
Cohesion: 0.16
Nodes (10): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+2 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.18
Nodes (8): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.06
Nodes (26): IJoinQueueDTO, IQueueItemResponseDTO, QueueStatus, IUpdateQueueItemDTO, MockQueueRepository, PrismaQueueStatus, QueueRepository, toDTO() (+18 more)

### Community 35 - "monitor-routes.js"
Cohesion: 0.11
Nodes (14): inject, ICreateUserDTO, RoleLiteral, DEFAULT_EMPLOYEE_PERMISSIONS, IUserResponseDTO, RoleLiteral, MockUserRepository, publicSelect (+6 more)

### Community 36 - "scripts"
Cohesion: 0.07
Nodes (29): scripts, build, db:migrate:status, db:push, db:push:prod, db:studio, db:validate-schema, dev (+21 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.18
Nodes (6): MercadoPagoService, injectable, CreateCardPaymentUseCase, inject, injectable, inject

### Community 38 - "index.ts"
Cohesion: 0.07
Nodes (14): LoyaltyController, AdjustManualInput, adjustManualSchema, ConfigureLoyaltyProgramInput, configureLoyaltyProgramSchema, RecordCashbackInput, recordCashbackSchema, RecordVisitInput (+6 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.06
Nodes (49): base(), CATALOG_TEMPLATES, CatalogTemplate, getCatalogTemplate(), STOCK_EXPENSE, InventoryEngine, lockProduct(), injectable (+41 more)

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
Cohesion: 0.11
Nodes (25): assertAppointmentBookable(), countEligibleStaff(), DbClient, overlaps(), timeToMinutes(), getShopOpenState(), utcDateFromYmd(), addDaysYmd() (+17 more)

### Community 46 - ".findById"
Cohesion: 0.14
Nodes (14): ExpenseCategoryRecord, mapExpenseCategoryToDTO(), mapServiceCategoryToDTO(), ServiceCategoryRecord, ExpenseCategoryRepository, ServiceCategoryRepository, IExpenseCategoryRepository, IServiceCategoryRepository (+6 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.08
Nodes (8): DepositController, ConfirmDepositInput, confirmDepositSchema, DepositListQueryInput, depositListQuerySchema, UpdateDepositPolicyInput, updateDepositPolicySchema, DepositUseCases

### Community 49 - "devDependencies"
Cohesion: 0.12
Nodes (26): broadcastPostToClients(), logger, agendaiWordmark(), badge(), buildPostSvg(), escapeXml(), formatBRL(), hoursCard() (+18 more)

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
Cohesion: 0.19
Nodes (19): asRecord(), evolutionApiKey(), evolutionBaseUrl(), EvolutionConnectionState, extractConnectionState(), extractMessageId(), extractPairingCode(), isEvolutionConfigured() (+11 more)

### Community 55 - "Barbearias"
Cohesion: 0.04
Nodes (49): DeleteLogoUseCase, inject, injectable, GetLogoUploadUrlUseCase, IGetLogoUploadUrlDTO, IGetLogoUploadUrlResult, inject, injectable (+41 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.11
Nodes (22): ENUM_TO_INPUT, logger, PostRow, postSelect, createPostSchema, designOptionsSchema, generatePostSchema, getConfigQuerySchema (+14 more)

### Community 58 - "AdminDashboardController.ts"
Cohesion: 0.06
Nodes (18): VoucherController, CreateInput, UpdateInput, usageSelect, VoucherRepository, voucherSelect, applyVoucherSchema, createVoucherSchema (+10 more)

### Community 59 - "IAppointmentRepository"
Cohesion: 0.50
Nodes (4): Admin — Assinaturas, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions` 🔒 🛡️ `MASTER_ADMIN`

### Community 60 - "GetQueueMetricsUseCase"
Cohesion: 0.06
Nodes (33): CheckInAppointmentController, checkInSchema, CheckInAppointmentUseCase, ICheckInDTO, ICheckInResult, logger, injectable, logger (+25 more)

### Community 61 - "🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI"
Cohesion: 0.09
Nodes (9): AsaasService, injectable, GetPaymentStatusController, GetPaymentStatusUseCase, inject, injectable, inject, inject (+1 more)

### Community 62 - "Categorias"
Cohesion: 0.17
Nodes (11): 1. Preparação, 2. Pré-validação, 3. Aplicação, 4. Pós-validação, Escala horizontal, Estado conhecido, Falhas e recuperação, Fluxo de deploy (+3 more)

### Community 63 - "app.ts"
Cohesion: 0.06
Nodes (31): dotenv-cli, devDependencies, dotenv-cli, prisma, @testcontainers/postgresql, tsup, tsx, @types/bcryptjs (+23 more)

### Community 64 - "ListBarbershopsUseCase.ts"
Cohesion: 0.18
Nodes (11): AdminBarbershopController, adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListBlockedEntitiesQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema (+3 more)

### Community 65 - "ListQueueController.ts"
Cohesion: 0.12
Nodes (11): CashMovementController, CashMovementQueryInput, cashMovementQuerySchema, CashSummaryQueryInput, cashSummaryQuerySchema, CreateCashMovementInput, createCashMovementSchema, dailyDateQuery (+3 more)

### Community 66 - "Google Cloud Storage — setup AgendAI"
Cohesion: 0.50
Nodes (4): Admin — Planos, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/plans` 🔒 🛡️ `MASTER_ADMIN`

### Community 67 - "13. Regras de Negócio Críticas"
Cohesion: 0.16
Nodes (13): AddFiadoPaymentInput, addFiadoPaymentSchema, ChargeFiadoInput, chargeFiadoSchema, CreateFiadoInput, createFiadoPaymentSchema, createFiadoSchema, ListFiadoQueryInput (+5 more)

### Community 68 - "Fiado"
Cohesion: 0.15
Nodes (9): FEATURE_NAMES, MaturityLevel, RECOMMENDATIONS, TreeNode, TreeOptions, SeasonalDecomposition, correlation(), mean() (+1 more)

### Community 69 - "GetBarbershopUseCase.ts"
Cohesion: 0.14
Nodes (7): RequestingUser, DemandPrediction, WeatherDataPoint, WeatherForecastPoint, ConfidenceLevel, EnhancedDemandPrediction, EnhancedDemandPredictor

### Community 70 - "CheckInAppointmentController.ts"
Cohesion: 0.06
Nodes (14): GiftCardController, GiftCardRepository, giftCardSelect, PurchaseInput, RedeemInput, usageSelect, giftCardListQuerySchema, giftCardStatusMap (+6 more)

### Community 71 - "PlansController.ts"
Cohesion: 0.15
Nodes (14): IEmailProvider, SendEmailInput, SendEmailResult, logger, ResendEmailProvider, injectable, MockEmailProvider, AUDIT_VALUE_ALLOWLIST (+6 more)

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.50
Nodes (4): Assinaturas, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `GET /subscriptions/me` 🔒, `POST /subscriptions` 🔒 🛡️ `MASTER_ADMIN, OWNER`

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.11
Nodes (15): BarbershopFinancialController, ExpenseRow, ExpenseWithCategory, FiadoRow, FiadoWithPayments, BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod (+7 more)

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.08
Nodes (13): entrySelect, ProfitRepository, settingsSelect, profitByServiceQuerySchema, profitByStaffQuerySchema, profitComputeSchema, profitManualAdjustmentSchema, profitPeriodQuerySchema (+5 more)

### Community 75 - "dependencies"
Cohesion: 0.22
Nodes (5): IPaymentResponseDTO, MockPaymentRepository, mapToDTO(), PaymentRepository, IUpdatePaymentStatusDTO

### Community 76 - "Passo a passo"
Cohesion: 0.18
Nodes (13): setupSwagger(), buildApp(), handleAppError(), correlationIdMiddleware(), registerRoutes(), errorMessage(), INVALID_IDENTIFIER_CODES, isPrismaInvalidUuidError() (+5 more)

### Community 77 - "Despesas"
Cohesion: 0.10
Nodes (16): forgotPasswordSchema, loginSchema, phoneBR, refreshSchema, resetPasswordSchema, scheduleItemSchema, switchAccountSchema, ForgotPasswordController (+8 more)

### Community 78 - "Pagamentos"
Cohesion: 0.32
Nodes (6): planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 80 - "7. Sistema de Assinaturas e Bloqueio de CPF"
Cohesion: 0.15
Nodes (7): CashMovementFilters, CashMovementRepository, CreateCashMovementData, DailyCloseoutData, DailyCloseoutRepository, DailyCloseoutResponse, DailyCloseoutUseCases

### Community 81 - "Apêndice B — Endpoints por Role"
Cohesion: 0.18
Nodes (11): buildCreateBody(), buildUpdateArgs(), CREATED_POST_ROW, fakeUser(), mockBarbershopFindUnique, mockBroadcast, mockFeedPostCreate, mockFeedPostFindUnique (+3 more)

### Community 82 - "Agendamentos"
Cohesion: 0.16
Nodes (15): CachedWeatherProvider, forecast, redis, MetNoPeriod, MetNoPoint, MetNoWeatherProvider, parseMetNoForecast(), symbolDetails() (+7 more)

### Community 83 - "Fila (Queue)"
Cohesion: 0.20
Nodes (16): catalogListQuerySchema, comboItemSchema, createAddonSchema, createComboSchema, createVariationSchema, updateAddonSchema, updateComboItemSchema, updateComboSchema (+8 more)

### Community 84 - "Serviços"
Cohesion: 0.09
Nodes (13): IBarbershopRepository, inject, inject, inject, GetScheduleController, GetScheduleUseCase, inject, injectable (+5 more)

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
Nodes (28): IBillingAddressDTO, ICardPayerDTO, ICreateCardPaymentDTO, ICreatePixPaymentDTO, IMercadoPagoWebhookDTO, IPixQrCodeDTO, PaymentMethod, PaymentProvider (+20 more)

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
Cohesion: 0.18
Nodes (9): DailyCloseoutController, CloseoutQueryInput, closeoutQuerySchema, CloseoutRangeQueryInput, closeoutRangeQuerySchema, CreateCloseoutInput, createCloseoutSchema, dateValue (+1 more)

### Community 94 - "Admin — Usuários"
Cohesion: 0.14
Nodes (23): getNotificationV2Mode(), emailWorker, dispatchBatch(), dispatchNotificationOutboxNow(), logger, nextBackoff(), startNotificationDispatcher(), enqueueLegacy() (+15 more)

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
Nodes (30): findExisting(), NotificationPayload, NotificationV2Mode, resolveSkipReason(), scheduleNotification(), ScheduleNotificationInput, uniqueKey(), canOwnerConfigureNotification() (+22 more)

### Community 101 - "Assinaturas"
Cohesion: 0.07
Nodes (15): PricingController, CreateInput, PricingRepository, ruleSelect, UpdateInput, createPricingRuleSchema, evaluatePriceSchema, pricingRuleTypeMap (+7 more)

### Community 102 - "Auth"
Cohesion: 0.11
Nodes (12): DeleteQueueItemController, DeleteQueueItemUseCase, inject, injectable, staff, channelName(), isRealtimeEvent(), logger (+4 more)

### Community 103 - "Financeiro da Barbearia"
Cohesion: 0.07
Nodes (19): adapter, defaultPlans, pool, prisma, logger, UserLike, UserWithEmailPassword, AccountDeletionRequestController (+11 more)

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
Cohesion: 0.12
Nodes (8): Claude, dependencies, devDependencies, Inventário de pacotes — Backend (agendai-back-end), Contrato com o frontend, Inventário de scripts — Backend (`agendai-back-end`), Observações críticas, Gemini

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
Cohesion: 0.15
Nodes (11): buildQueueUpdateMessage(), buildReminderMessage(), calendarDateParts(), createAppointmentAtomic(), FORBIDDEN_TRANSITIONS, formatSaoPauloTime(), mapCreatedAppointment(), ReminderResult (+3 more)

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
Cohesion: 0.06
Nodes (15): ClientPortalController, barbershopIdQuerySchema, CLIENT_PORTAL_OWNER_ROLES, CLIENT_PORTAL_STAFF_ROLES, clientPortalQuerySchema, confirmLinkSchema, createCareTemplateSchema, linkIdParamsSchema (+7 more)

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
Cohesion: 0.11
Nodes (13): CronLogger, scheduleDepositExpiration(), ChargeTrialEndedSubscriptionsUseCase, injectable, CronLogger, CronLogger, scheduleAppointmentReminders(), CronLogger (+5 more)

### Community 128 - "tsup"
Cohesion: 0.09
Nodes (30): getMonitoringDashboard(), hoursAgo(), minutesAgo(), getNotificationOperationsHealth(), heartbeatStatus(), ProcessRole, logger, RedisRateLimitStore (+22 more)

### Community 130 - "@types/bcryptjs"
Cohesion: 0.18
Nodes (3): ClientPortalRepository, generateOtpCode(), normalizePhone()

### Community 131 - "@types/node"
Cohesion: 0.32
Nodes (8): BusinessSegment, ManualShopStatus, OpeningMode, ShopOpenStateDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO, shopSelect, ScheduleItem

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
Cohesion: 0.10
Nodes (10): FiscalController, FiscalConfigInput, fiscalConfigSchema, FiscalStatsQueryInput, fiscalStatsQuerySchema, IssueNfeInput, issueNfeSchema, NfeQueryInput (+2 more)

### Community 148 - "QueueRepository"
Cohesion: 0.35
Nodes (9): FiadoStatus, ICreateFiadoDTO, ICreateFiadoPaymentDTO, IFiadoListQuery, IFiadoPaymentResponseDTO, IFiadoSummary, IUpdateFiadoDTO, FiadoPaymentRecord (+1 more)

### Community 152 - "RefundPaymentUseCase"
Cohesion: 0.17
Nodes (11): 1. Criar conta no Cloudinary, 2. Copiar credenciais, 3. Adicionar ao `.env`, 4. (Opcional) Criar pasta folders, Cloudinary — Fallback de Storage AgendAI, Como funciona o fallback, Comportamento por cenário, Notas técnicas (+3 more)

### Community 153 - "cancelSubscription.spec.ts"
Cohesion: 0.26
Nodes (7): assertSameBarbershop(), assertShopWhatsAppConnected(), buildPostImage(), defaultCtaText(), loadPostContext(), PostsController, toPostResponse()

### Community 154 - "PENTEST_REPORT_TEMPLATE.md"
Cohesion: 0.05
Nodes (39): bcryptjs, bullmq, cloudinary, disposable-email-domains, fastify, @fastify/cors, @fastify/swagger-ui, @fastify/websocket (+31 more)

### Community 155 - "fastify"
Cohesion: 0.06
Nodes (7): OrganizationController, OrganizationRepository, createOrganizationSchema, inviteMemberSchema, updateMemberRoleSchema, updateOrganizationSchema, OrganizationUseCases

### Community 157 - "@testcontainers/postgresql"
Cohesion: 0.33
Nodes (3): ISellClientPackageDTO, owner(), seedClientAndPackage()

### Community 163 - "AsaasService.ts"
Cohesion: 0.13
Nodes (9): DeleteServiceController, DeleteServiceUseCase, inject, injectable, GetServiceController, GetServiceUseCase, inject, injectable (+1 more)

### Community 165 - "assertAppointmentBookable.ts"
Cohesion: 0.09
Nodes (13): MembershipController, CreateMembershipInput, CreateMembershipPlanInput, createMembershipPlanSchema, createMembershipSchema, MembershipListQueryInput, membershipListQuerySchema, RecordPaymentInput (+5 more)

### Community 166 - "ExportUserDataUseCase"
Cohesion: 0.13
Nodes (8): ReputationRepository, reputationSelect, RespondInput, reviewResponseSelect, reputationQuerySchema, respondToReviewSchema, ReputationUseCases, RespondInput

### Community 167 - "AdminNotificationController.ts"
Cohesion: 0.20
Nodes (8): CompleteAppointmentController, completeAppointmentSchema, CompleteAppointmentRequest, CompleteAppointmentUseCase, ProcedureInput, inject, injectable, retailSalePayloadSchema

### Community 168 - "AdminNotificationController"
Cohesion: 0.06
Nodes (24): AppointmentController, executeSlots, createPublicAppointmentToken(), PublicAppointmentPayload, PublicPurpose, readPublicAppointmentToken(), ADMIN, otherOwner (+16 more)

### Community 169 - "google-auth-library"
Cohesion: 0.13
Nodes (8): CopilotRepository, suggestionSelect, acceptSchema, copilotSuggestionTypeMap, dismissSchema, listSuggestionsSchema, markReadSchema, ListQuery

### Community 171 - "JoinQueueController.ts"
Cohesion: 0.33
Nodes (6): assertShopAccess(), idSchema, manualStatusSchema, queueStatusSchema, shopPayload(), ShopStatusController

### Community 173 - "@opentelemetry/resources"
Cohesion: 0.15
Nodes (8): GoogleLoginUseCase, mockFindByEmail, mockUser, mockVerifyIdToken, prismaMock, inject, injectable, checkBarbershopAccess()

### Community 174 - "@opentelemetry/sdk-node"
Cohesion: 0.15
Nodes (10): createServiceSchema, updateServiceSchema, CreateServiceController, CreateServiceUseCase, inject, injectable, UpdateServiceController, inject (+2 more)

### Community 176 - "pino"
Cohesion: 0.25
Nodes (7): CrmForecastDTO, CronLogger, fetchOpenMeteoLogDay(), finite(), getForecastForDate(), populateDailyWeatherLog(), scheduleDailyWeatherLog()

### Community 177 - "@sentry/node"
Cohesion: 0.17
Nodes (11): ALL_PERMISSIONS, cpfSchema, CreateUserDTO, createUserSchema, LoginDTO, loginSchema, permissionsSchema, StaffUpdateUserDTO (+3 more)

### Community 180 - "GetPaymentStatusUseCase"
Cohesion: 0.21
Nodes (11): EmailTemplateId, emailDestination(), EmailJobData, emailNotificationType(), emailQueue, emailQueueEvents, enqueueLegacy(), getEvents() (+3 more)

### Community 181 - "ForgotPasswordUseCase"
Cohesion: 0.29
Nodes (4): ListServicesController, ListServicesUseCase, inject, injectable

### Community 182 - "payments.routes.ts"
Cohesion: 0.22
Nodes (9): Fiado / despesas / comissões, Fila / agenda / híbrido, Notificações, Pacotes, Pagamentos, Produtos / estoque / retail, Regras de negócio — Backend, Tenant, permissões, RLS (+1 more)

### Community 184 - "AdminBarbershopController"
Cohesion: 0.19
Nodes (16): addFieldSchema, createFormSchema, formFieldTypeEnum, formListQuerySchema, formResponseListQuerySchema, formTypeEnum, submitResponseSchema, updateFieldSchema (+8 more)

### Community 186 - "bruteForceProtection.spec.ts"
Cohesion: 0.24
Nodes (4): DeleteBarbershopController, DeleteBarbershopUseCase, inject, injectable

### Community 187 - "@fastify/rate-limit"
Cohesion: 0.33
Nodes (4): mockGetById, mockGetPublishedById, mockListPublished, mockRecordEvent

### Community 188 - "@google-cloud/storage"
Cohesion: 0.22
Nodes (8): Backup do Render, Cutover, Migração PostgreSQL Render → Supabase, Preparação do Supabase, Reconciliação obrigatória, Regras de segurança, Rollback, Variáveis

### Community 189 - "pg"
Cohesion: 0.05
Nodes (27): barbershopId(), IntegrationController, IntegrationRepository, asaasConfig, configSchemas, createIntegrationSchema, credentialSchemas, evolutionApiConfig (+19 more)

### Community 190 - "@upstash/redis"
Cohesion: 0.40
Nodes (4): AUTH_AND_HIDDEN_KEYS, findFirst, findMany, findUnique

### Community 191 - "Runbook: Aplicar migrations do backend em Staging/Produção"
Cohesion: 0.24
Nodes (13): availabilityQuerySchema, createResourceBookingSchema, createResourceSchema, resourceBookingsListQuerySchema, resourceListQuerySchema, updateResourceBookingSchema, updateResourceSchema, AvailabilityQuery (+5 more)

### Community 200 - "CompleteServiceUseCase.ts"
Cohesion: 0.19
Nodes (16): backfillCrmLedger(), EventInput, recordAppointmentCompletion(), recordCrmFinancialEvent(), recordFiadoCreated(), recordFiadoPayment(), recordPackageSale(), recordQueueCompletion() (+8 more)

### Community 202 - "assertOperationEnabled.ts"
Cohesion: 0.27
Nodes (5): ListBarbershopsController, ListBarbershopsUseCase, inject, injectable, toPublicBarbershop()

### Community 203 - "index.ts"
Cohesion: 0.14
Nodes (12): CommissionController, ICommissionEntryDTO, ICommissionSplitDTO, ICommissionSummary, IListCommissionsQuery, CommissionRepository, CommissionWithRelations, dateFilter() (+4 more)

### Community 204 - "CancelSubscriptionController.ts"
Cohesion: 0.16
Nodes (3): IBarbershopResponseDTO, BarbershopRepository, MockBarbershopRepository

### Community 205 - "check-docs.mjs"
Cohesion: 0.25
Nodes (5): entryFiles, errors, modulesDir, pkg, root

### Community 206 - "ProcessAsaasWebhookUseCase.ts"
Cohesion: 0.16
Nodes (8): ExpenseCategoryController, expenseCatRepo, ServiceCategoryController, serviceCatRepo, createExpenseCategorySchema, createServiceCategorySchema, updateExpenseCategorySchema, updateServiceCategorySchema

### Community 207 - "ExportFinancialDataUseCase.ts"
Cohesion: 0.13
Nodes (6): CreateMembershipData, CreatePlanData, MembershipListFilters, RecordPaymentData, UpdatePlanData, MembershipUseCases

### Community 208 - "resendWebhookService.ts"
Cohesion: 0.15
Nodes (11): IRegisterDTO, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate, mockTxScheduleCreateMany (+3 more)

### Community 209 - "GetPaymentStatusUseCase"
Cohesion: 0.13
Nodes (10): allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody, timingSafeStringEqual(), IAbacateWebhookPayload, allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual() (+2 more)

### Community 210 - "AGENTS.md — AgendAI Backend"
Cohesion: 0.33
Nodes (6): 0. Regras essenciais, 1. O que é esta API, 2. Inventários locais, 3. Comandos frequentes, 4. Checklist de mudança, AGENTS.md — AgendAI Backend

### Community 212 - "Arquitetura backend — Clean Architecture e SOLID"
Cohesion: 0.33
Nodes (5): Arquitetura backend — Clean Architecture e SOLID, Fluxo de execução vs direção das dependências, Responsabilidades, SOLID (exemplos locais), Transações

### Community 213 - "queueDuplicate.ts"
Cohesion: 0.05
Nodes (40): updateQueueItemSchema, notifyQueueCapacity(), mocks, JoinQueueController, JoinQueueUseCase, inject, injectable, buildQueueCalledMessage() (+32 more)

### Community 214 - "Estrutura — Backend (`agendai-back-end`)"
Cohesion: 0.36
Nodes (8): checkDatabase(), checkMigrations(), checkRedis(), healthRoutes(), getStorageHealthStatus(), isCloudinaryConfigured(), isGcsConfigured(), StorageHealthStatus

### Community 216 - "CheckInAppointmentUseCase.ts"
Cohesion: 0.24
Nodes (11): assignServiceSchema, deleteScheduleSchema, removeServiceSchema, requestTimeOffSchema, timeOffQuerySchema, timeOffStatusEnum, upsertScheduleSchema, AssignServiceInput (+3 more)

### Community 220 - "ResetPasswordUseCase"
Cohesion: 0.40
Nodes (4): Checkout de assinatura (implementado), Domínios → persistência (visão), Mapa de domínio — Backend, Testes

### Community 221 - "notifications.routes.ts"
Cohesion: 0.29
Nodes (10): createShowcaseEntrySchema, showcaseEventQuerySchema, showcaseListQuerySchema, showcaseOrderSchema, updateShowcaseEntrySchema, CreateInput, EventQuery, ListQuery (+2 more)

### Community 228 - "ListSubscriptionsController"
Cohesion: 0.29
Nodes (4): issueProratedRefundMock, prismaMock, cancelReasonSchema, CancelSubscriptionController

### Community 230 - "google-auth-library"
Cohesion: 0.29
Nodes (7): 1. Projeto GCP, 2. Variáveis no `.env`, 3. Criar Service Account + chave JSON, 4. Bucket, CORS, IAM público e pastas, 5. Rodar a API, 6. Smoke test, Passo a passo

### Community 231 - "ioredis"
Cohesion: 0.43
Nodes (5): AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period

### Community 235 - "DeleteAvatarUseCase"
Cohesion: 0.33
Nodes (3): mapFiadoToDTO(), mapPaymentToDTO(), FiadoRepository

### Community 237 - "GetWeatherForecastUseCase.ts"
Cohesion: 0.15
Nodes (11): GetWeatherForecastController, GetWeatherForecastUseCase, RequestingUser, inject, injectable, geocodeCity(), GeocodingResult, cache (+3 more)

### Community 241 - "@opentelemetry/instrumentation-fastify"
Cohesion: 0.33
Nodes (5): Estrutura — Backend (`agendai-back-end`), Middlewares, Módulos (`src/modules/`), Providers / integrações (arquivos), Rotas HTTP (`shared/infra/http/routes/`)

### Community 244 - "GetCrmForecastUseCase"
Cohesion: 0.20
Nodes (9): addonSelect, comboSelect, CreateAddon, CreateCombo, CreateVariation, UpdateAddon, UpdateCombo, UpdateVariation (+1 more)

### Community 246 - "RecordActivationEventUseCase"
Cohesion: 0.25
Nodes (7): CreateInput, entrySelect, publicEntrySelect, UpdateInput, imageAuthorizationMap, showcaseModeMap, showcaseStatusMap

### Community 247 - "reconciliationService.ts"
Cohesion: 0.21
Nodes (6): GetBarbershopController, GetBarbershopUseCase, injectable, ListPublicStaffUseCase, PublicStaffMember, injectable

### Community 249 - "ExportFinancialDataUseCase"
Cohesion: 0.38
Nodes (5): csvCell(), ExportFinancialDataUseCase, ExportRequest, maskName(), injectable

### Community 255 - "WhatsAppConnectionUseCase"
Cohesion: 0.33
Nodes (3): mockEnqueue, mockFindMany, mockFindUnique

### Community 256 - "subscribe.spec.ts"
Cohesion: 0.53
Nodes (4): makeFullSubscription(), makeSubscription(), NOW, prismaMock

### Community 257 - "IntegrationRepository"
Cohesion: 0.40
Nodes (5): 11.1 Configuração, 11.2 Padrão de teste, 11.3 Executar testes, 11.4 O que deve ser testado, 11. Testes

### Community 258 - "14. Integrações Externas"
Cohesion: 0.40
Nodes (5): 14.0 E-mail (Resend) + Indicação, 14.1 Mercado Pago, 14.2 Google Cloud Storage, 14.3 Variáveis de Ambiente Obrigatórias em Produção, 14. Integrações Externas

### Community 262 - "formRepository.ts"
Cohesion: 0.25
Nodes (7): AddFieldInput, CreateFormInput, formSelect, responseSelect, SubmitResponseInput, UpdateFieldInput, UpdateFormInput

### Community 263 - "productUseCases.ts"
Cohesion: 0.50
Nodes (3): Comandos, Graphify — Backend, Procedimento obrigatório

### Community 264 - "resourceRepository.ts"
Cohesion: 0.25
Nodes (7): bookingSelect, CreateBookingInput, CreateResourceInput, resourceSelect, UpdateBookingInput, UpdateResourceInput, resourceTypeMap

### Community 265 - "Auth"
Cohesion: 0.50
Nodes (4): Auth, `GET /auth/me` 🔒, `POST /auth/login`, `POST /auth/refresh`

### Community 266 - "Sistema de Assinaturas"
Cohesion: 0.50
Nodes (4): Fluxo de assinatura, Sistema de Assinaturas, Status de assinatura, Trial

### Community 267 - "staffRepository.ts"
Cohesion: 0.29
Nodes (6): AssignServiceInput, RequestTimeOffInput, scheduleSelect, serviceSelect, timeOffSelect, UpsertScheduleInput

### Community 271 - "verifyRecaptcha.ts"
Cohesion: 0.20
Nodes (5): ListActivationMetricsUseCase, injectable, RecordActivationEventDTO, RecordActivationEventUseCase, injectable

### Community 273 - "blockedEntitySchemas.ts"
Cohesion: 0.07
Nodes (39): AdminUserController, BlockedEntityAdminController, BlockInput, blockSchema, UnblockInput, unblockSchema, logger, RegisterUseCase (+31 more)

### Community 275 - "ReputationController"
Cohesion: 0.20
Nodes (5): GetOnboardingProgressUseCase, injectable, injectable, UpdateOnboardingProgressDTO, UpdateOnboardingProgressUseCase

### Community 276 - "enhancedDemandPredictor.ts"
Cohesion: 0.21
Nodes (5): classifyMaturity(), confidenceInterval(), DemandPredictor, finite(), walkForwardBacktest()

## Knowledge Gaps
- **1133 isolated node(s):** `docker-entrypoint.sh script`, `args`, `base`, `token`, `shopId` (+1128 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **76 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `GetQueueMetricsUseCase` to `api.ts`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `IBarbershopRepository`, `AppError`, `💈 AgendAI — Backend API`, `appointments.spec.ts`, `auth.routes.ts`, `MercadoPagoService`, `IUserResponseDTO`, `IPaymentDTO.ts`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `LogoController.ts`, `emailWorker.ts`, `paymentSchemas.ts`, `monitor-routes.js`, `index.ts`, `Referência Completa de Rotas`, `referralService.ts`, `index.ts`, `ContactController.ts`, `QueueRepository`, `9. Como Criar um Novo Módulo`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `ListQueueController.ts`, `13. Regras de Negócio Críticas`, `GetBarbershopUseCase.ts`, `CheckInAppointmentController.ts`, `6. Sistema de Autenticação e Autorização`, `8. Banco de Dados e Prisma`, `Passo a passo`, `Pagamentos`, `7. Sistema de Assinaturas e Bloqueio de CPF`, `Fila (Queue)`, `Serviços`, `CrmController`, `Admin — Entidades Bloqueadas`, `CrmRepository.ts`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `Auth`, `Financeiro da Barbearia`, `@fastify/multipart`, `@fastify/swagger-ui`, `ProcessAbacateWebhookController.ts`, `Pentest local — inputs, upload, XSS e exposição pública`, `UpdateBarbershopUseCase`, `QueueRepository`, `fastify`, `AsaasService.ts`, `assertAppointmentBookable.ts`, `ExportUserDataUseCase`, `AdminNotificationController.ts`, `AdminNotificationController`, `google-auth-library`, `JoinQueueController.ts`, `AdminBarbershopController`, `@fastify/rate-limit`, `pg`, `Runbook: Aplicar migrations do backend em Staging/Produção`, `CompleteServiceUseCase.ts`, `index.ts`, `ProcessAsaasWebhookUseCase.ts`, `ExportFinancialDataUseCase.ts`, `queueDuplicate.ts`, `CheckInAppointmentUseCase.ts`, `notifications.routes.ts`, `ListSubscriptionsController`, `DailyCloseoutController`, `GetWeatherForecastUseCase.ts`, `GetCrmForecastUseCase`, `RecordActivationEventUseCase`, `reconciliationService.ts`, `ExportFinancialDataUseCase`, `formRepository.ts`, `resourceRepository.ts`, `staffRepository.ts`, `verifyRecaptcha.ts`, `blockedEntitySchemas.ts`, `ReputationController`?**
  _High betweenness centrality (0.186) - this node is a cross-community bridge._
- **Why does `prisma` connect `IPaymentDTO.ts` to `api.ts`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `AppError`, `IBarbershopResponseDTO`, `IStorageProvider`, `appointments.spec.ts`, `IPlanResponseDTO`, `auth.routes.ts`, `MercadoPagoService`, `RegisterUseCase.ts`, `IPaymentResponseDTO`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `emailWorker.ts`, `IPaymentRepository`, `paymentSchemas.ts`, `monitor-routes.js`, `Referência Completa de Rotas`, `referralService.ts`, `index.ts`, `.findById`, `devDependencies`, `QueueRepository`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `GetQueueMetricsUseCase`, `ListBarbershopsUseCase.ts`, `GetBarbershopUseCase.ts`, `CheckInAppointmentController.ts`, `PlansController.ts`, `6. Sistema de Autenticação e Autorização`, `8. Banco de Dados e Prisma`, `Passo a passo`, `Pagamentos`, `7. Sistema de Assinaturas e Bloqueio de CPF`, `CrmController`, `Admin — Usuários`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `Auth`, `Financeiro da Barbearia`, `@fastify/multipart`, `@fastify/swagger-ui`, `zod`, `tsup`, `@types/node`, `vitest.config.mts`, `sendWhatsAppMessage`, `QueueRepository`, `fastify`, `ExportUserDataUseCase`, `AdminNotificationController.ts`, `AdminNotificationController`, `google-auth-library`, `JoinQueueController.ts`, `pino`, `bruteForceProtection.spec.ts`, `CompleteServiceUseCase.ts`, `index.ts`, `ExportFinancialDataUseCase.ts`, `queueDuplicate.ts`, `Estrutura — Backend (`agendai-back-end`)`, `ListSubscriptionsController`, `ioredis`, `DailyCloseoutController`, `GetCrmForecastUseCase`, `RecordActivationEventUseCase`, `reconciliationService.ts`, `ExportFinancialDataUseCase`, `formRepository.ts`, `resourceRepository.ts`, `staffRepository.ts`, `verifyRecaptcha.ts`, `blockedEntitySchemas.ts`, `ReputationController`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `IntegrationRepository` connect `pg` to `IPaymentDTO.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 57 inferred relationships involving `authenticate()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`authenticate()` has 57 INFERRED edges - model-reasoned connections that need verification._
- **Are the 56 inferred relationships involving `setRlsContext()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`setRlsContext()` has 56 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `args`, `base` to the rest of the system?**
  _1133 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05118914901523597 - nodes in this community are weakly interconnected._