# Graph Report - agendai-back-end  (2026-09-28)

## Corpus Check
- 858 files · ~326,307 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5582 nodes · 13170 edges · 277 communities (224 shown, 53 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 366 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `796be826`
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
- postAiService.spec.ts
- users.routes.ts
- CrmController.ts
- ListSubscriptionsController
- copilot-instructions.md
- emailWorker.ts
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
- CancelSubscriptionController.ts
- paymentProviderSnapshot.ts
- GetCrmForecastUseCase
- subscriptionAccess.ts
- RecordActivationEventUseCase
- reconciliationService.ts
- @fastify/cors
- PlansController
- ListSubscriptionsController
- StaffUseCases
- GoogleLoginUseCase
- verifyRecaptcha.ts
- IntegrationRepository
- 14. Integrações Externas
- formRepository.ts
- Sistema de Assinaturas
- staffRepository.ts
- .constructor
- LoyaltyRepository
- blockedEntitySchemas.ts
- verify-delivery.mjs
- WorkSummaryController.ts
- productsInventory.ts
- cleanOldLogs.cron.ts
- Revisão do lote de e-mails — 2026-09-21

## God Nodes (most connected - your core abstractions)
1. `AppError` - 262 edges
2. `prisma` - 207 edges
3. `authenticate()` - 122 edges
4. `setRlsContext()` - 116 edges
5. `authorize()` - 113 edges
6. `checkSubscription()` - 106 edges
7. `apiRoutes()` - 65 edges
8. `checkDashboardAccess()` - 63 edges
9. `getRedisConnection()` - 62 edges
10. `IBarbershopRepository` - 58 edges

## Surprising Connections (you probably didn't know these)
- `seedDemoData()` --calls--> `seedBarbershopDefaults()`  [EXTRACTED]
  prisma/seed.ts → src/shared/utils/seedBarbershopDefaults.ts
- `seedTenantDefaults()` --calls--> `seedBarbershopDefaults()`  [EXTRACTED]
  prisma/seed.ts → src/shared/utils/seedBarbershopDefaults.ts
- `qualifyReferralOnPayment()` --indirect_call--> `base()`  [INFERRED]
  src/modules/referrals/services/referralService.ts → src/modules/products/catalogTemplates.ts
- `scheduleAppointmentReminders()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/cron/appointmentReminders.cron.ts → src/modules/appointments/useCases/appointmentUseCases.ts
- `notificationsRoutes()` --indirect_call--> `SendAppointmentRemindersUseCase`  [INFERRED]
  src/shared/infra/http/routes/notifications.routes.ts → src/modules/appointments/useCases/appointmentUseCases.ts

## Import Cycles
- None detected.

## Communities (277 total, 53 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.05
Nodes (115): activationRoutes(), analyticsRoutes(), ActivationController, reviewRoutes(), reviewSchema, mePreHandler(), blockSchema, calendarRoutes() (+107 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.04
Nodes (37): TaskController, TicketController, acceptInvitationSchema, adminAuditLogQuerySchema, createTaskCommentSchema, createTaskSchema, createTicketCommentSchema, createTicketSchema (+29 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.08
Nodes (22): CompleteAppointmentController, completeAppointmentSchema, ProductsController, shopId(), adjustmentSchema, createProductSchema, createReceiptSchema, createRetailSaleSchema (+14 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.08
Nodes (22): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentRepository, AppointmentWithRelations (+14 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.11
Nodes (22): assertPaymentProviderEnabled(), EnabledPaymentProvider, enabledPaymentProviders(), assertPaymentEntityRefs(), IInvoiceResponseDTO, ISubscribeDTO, ISubscriptionResponseDTO, SubscriptionStatus (+14 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.13
Nodes (13): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, CreateServiceUseCase, inject (+5 more)

### Community 6 - "index.ts"
Cohesion: 0.07
Nodes (38): getOwnerContactForBarbershop(), ProcessAsaasWebhookUseCase, injectable, refundBodySchema, RefundPaymentController, logger, RefundPaymentUseCase, injectable (+30 more)

### Community 7 - "compilerOptions"
Cohesion: 0.08
Nodes (25): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+17 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.12
Nodes (36): assertShopAccess(), detachEvolutionInstanceWithTimeout(), ShopWhatsAppDto, ShopWhatsAppStatus, WhatsAppConnectInput, evolutionNotConfiguredError(), shopEvolutionInstanceName(), asRecord() (+28 more)

### Community 9 - "AppError"
Cohesion: 0.07
Nodes (31): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+23 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.07
Nodes (31): ClientPackageController, resolveBarbershopId(), ServicePackageController, BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema, dateField (+23 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.13
Nodes (15): IBookPackageSlotDTO, ICreateServicePackageDTO, ISellClientPackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map() (+7 more)

### Community 12 - "normalizeCpf"
Cohesion: 0.06
Nodes (18): AbacatePayService, injectable, AsaasService, injectable, ProratedRefundInput, CancelPaymentController, CancelPaymentUseCase, logger (+10 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.07
Nodes (26): AuthConfig, refreshSchema, issueAuthSession(), mapRole(), UserLike, findUsableRefreshToken(), RefreshTokenResult, UserLike (+18 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.16
Nodes (14): OperationMode, ChangeOperationModeController, ChangeOperationModeDTO, ChangeOperationModeResult, ChangeOperationModeUseCase, inject, injectable, assertOperationEnabled() (+6 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.11
Nodes (32): refreshCrmCampaignStatus(), prismaMock, getProcessRole(), shouldRunApi(), shouldRunCrons(), shouldRunWorkers(), VALID_ROLES, ALLOWED_TABLES (+24 more)

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
Cohesion: 0.03
Nodes (55): sensitiveRoutes, adapter, hasSslMode, pool, prisma, Recommendation, ListActivationMetricsUseCase, injectable (+47 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.06
Nodes (26): AppointmentController, executeSlots, ADMIN, otherOwner, buildQueueUpdateMessage(), buildReminderMessage(), calendarDateParts(), CancelAppointmentUseCase (+18 more)

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.11
Nodes (16): ClientController, ISalonClientRepository, CreateClientInput, createClientSchema, ListClientsQueryInput, listClientsQuerySchema, phoneBR, UpdateClientInput (+8 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.12
Nodes (14): AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput, allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody (+6 more)

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.12
Nodes (28): BarbershopEmailSettings, canReceiveEmail(), categoryDefaultEnabled(), EMAIL_CATEGORY, emailCategoryLabel(), EmailCategoryValue, EmailPreference, EmailUnsubscribePayload (+20 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.10
Nodes (16): ProcedureRecordController, ICreateProcedureRecordDTO, IProcedureRecordResponseDTO, IUpdateProcedureRecordDTO, IProcedureRecordRepository, ProcedureRecordRepository, assertShopAccess(), assertStaffRole() (+8 more)

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.23
Nodes (11): emailDestination(), EmailJobData, emailNotificationType(), emailQueue, emailQueueEvents, enqueueLegacy(), getEvents(), getQueue() (+3 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.19
Nodes (11): assertSameBarbershop(), ENUM_TO_INPUT, FeedController, FeedRow, feedSelect, toResponse(), createFeedPostSchema, FEED_TYPE_MAP (+3 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.08
Nodes (34): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DailyLimitExceededError (+26 more)

### Community 28 - "IQueueRepository"
Cohesion: 0.18
Nodes (13): GetSubscriptionController, loadActivePlans(), SubscriptionEconomicsController, computePlanEconomics(), computePlatformEconomics(), inferTierKey(), monthsBetween(), PlanBillingCycle (+5 more)

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.06
Nodes (21): VisitController, AddItem, CloseTab, CreateVisit, RecordPayment, VisitRepository, visitSelect, addItemSchema (+13 more)

### Community 30 - "queue.spec.ts"
Cohesion: 0.07
Nodes (61): VerifyEmailController, VerifyEmailUseCase, categoryForTemplate(), agendaiEmailBase(), COLORS, EmailTheme, escapeHtml(), safeUrl() (+53 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.14
Nodes (11): RequestingUser, CrmForecastDTO, realtimeWsRoutes(), WsJwt, WeatherForecastPoint, cache, Location, pending (+3 more)

### Community 32 - "emailWorker.ts"
Cohesion: 0.14
Nodes (10): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, PackagePaymentMethod, ClientPackageRepository, include, map(), MockClientPackageRepository (+2 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.18
Nodes (8): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.06
Nodes (24): IJoinQueueDTO, IQueueItemResponseDTO, QueueStatus, IUpdateQueueItemDTO, MockQueueRepository, PrismaQueueStatus, QueueRepository, toDTO() (+16 more)

### Community 35 - "monitor-routes.js"
Cohesion: 0.08
Nodes (25): ICreateUserDTO, RoleLiteral, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, IUserResponseDTO, RoleLiteral, MockUserRepository, publicSelect (+17 more)

### Community 36 - "scripts"
Cohesion: 0.18
Nodes (15): ReferralsController, applyReferralCode(), generateCode(), getReferralDashboard(), logger, tierLabel(), GetMyReferralsUseCase, injectable (+7 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.22
Nodes (17): InventoryEngine, lockProduct(), injectable, Tx, writeMovement(), CatalogProductSnapshot, namesToSkip(), nextStockQty() (+9 more)

### Community 38 - "index.ts"
Cohesion: 0.07
Nodes (14): LoyaltyController, AdjustManualInput, adjustManualSchema, ConfigureLoyaltyProgramInput, configureLoyaltyProgramSchema, RecordCashbackInput, recordCashbackSchema, RecordVisitInput (+6 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.16
Nodes (12): getCatalogTemplate(), assertProductPermission(), canGiveDiscount(), canOverrideProductPrice(), canSeeProductCosts(), COST_PERMISSIONS, isPrivilegedActor(), loadEmployeePermissions() (+4 more)

### Community 40 - "appointmentUseCases.ts"
Cohesion: 0.18
Nodes (11): AdminBarbershopController, adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListBlockedEntitiesQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema (+3 more)

### Community 41 - "payments.spec.ts"
Cohesion: 0.18
Nodes (3): ClientPortalRepository, generateOtpCode(), normalizePhone()

### Community 42 - "IQueueItemResponseDTO"
Cohesion: 0.11
Nodes (19): 💈 Agenda Já — Backend API, Autenticação, Com Docker (recomendado), Como Rodar, Configuração do Ambiente, Documentação Swagger, Estrutura do Projeto, Principais entidades (+11 more)

### Community 43 - "assertAppointmentBookable.ts"
Cohesion: 0.12
Nodes (16): Admin — Audit Logs, Admin — Dashboard, Admin — Financeiro, `GET /admin/audit-logs` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/dashboard`, `GET /admin/financial/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/overview` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/financial/summary` 🔒 🛡️ `MASTER_ADMIN` (+8 more)

### Community 44 - "referralService.ts"
Cohesion: 0.16
Nodes (21): createSeedClient(), defaultPlans, isDirectExecution(), looksLikeProductionEnvironment(), main(), parseCliArgs(), resolveSeedProfile(), runSeed() (+13 more)

### Community 45 - "index.ts"
Cohesion: 0.20
Nodes (19): getShopOpenState(), utcDateFromYmd(), addDaysYmd(), computeShopOpenState(), effectiveManualStatus(), hoursFrom(), ManualShopStatus, minutesInTimeZone() (+11 more)

### Community 46 - ".findById"
Cohesion: 0.13
Nodes (14): ExpenseCategoryRecord, mapExpenseCategoryToDTO(), mapServiceCategoryToDTO(), ServiceCategoryRecord, ExpenseCategoryRepository, ServiceCategoryRepository, IExpenseCategoryRepository, IServiceCategoryRepository (+6 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.05
Nodes (13): DepositController, ConfirmDepositInput, confirmDepositSchema, DepositListQueryInput, depositListQuerySchema, UpdateDepositPolicyInput, updateDepositPolicySchema, ConfirmDepositData (+5 more)

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.17
Nodes (7): channelName(), isRealtimeEvent(), logger, RealtimeEvent, RealtimeHub, RealtimeTopic, SendableSocket

### Community 49 - "devDependencies"
Cohesion: 0.14
Nodes (24): agendaiWordmark(), badge(), buildPostSvg(), escapeXml(), formatBRL(), hoursCard(), LayoutCtx, photoPanel() (+16 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.10
Nodes (15): SupportController, CreateAdminNotificationData, CreateHistoryData, CreateReportData, generateProtocol(), SupportRepository, addCommentSchema, CreateReportInput (+7 more)

### Community 51 - "server.ts"
Cohesion: 0.12
Nodes (18): ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository, ClientDetailRecord (+10 more)

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
Cohesion: 0.04
Nodes (50): ConfirmLogoUseCase, IConfirmLogoDTO, inject, injectable, DeleteLogoUseCase, inject, injectable, GetLogoUploadUrlUseCase (+42 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.09
Nodes (28): ENUM_TO_INPUT, logger, PostRow, postSelect, createPostSchema, designOptionsSchema, generatePostSchema, getConfigQuerySchema (+20 more)

### Community 58 - "AdminDashboardController.ts"
Cohesion: 0.06
Nodes (18): VoucherController, CreateInput, UpdateInput, usageSelect, VoucherRepository, voucherSelect, applyVoucherSchema, createVoucherSchema (+10 more)

### Community 59 - "IAppointmentRepository"
Cohesion: 0.50
Nodes (4): Admin — Assinaturas, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions` 🔒 🛡️ `MASTER_ADMIN`

### Community 60 - "GetQueueMetricsUseCase"
Cohesion: 0.13
Nodes (15): ALLOWED_MIME_SET, logger, UploadVideoController, IUploadVideoDTO, IUploadVideoResult, inject, injectable, UploadVideoUseCase (+7 more)

### Community 61 - "🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI"
Cohesion: 0.13
Nodes (13): createAppointmentAtomic(), mapCreatedAppointment(), assertAppointmentBookable(), countEligibleStaff(), DbClient, overlaps(), timeToMinutes(), assertPackageBookable() (+5 more)

### Community 62 - "Categorias"
Cohesion: 0.17
Nodes (11): 1. Preparação, 2. Pré-validação, 3. Aplicação, 4. Pós-validação, Escala horizontal, Estado conhecido, Falhas e recuperação, Fluxo de deploy (+3 more)

### Community 63 - "app.ts"
Cohesion: 0.21
Nodes (9): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, TOPIC_LABEL (+1 more)

### Community 64 - "ListBarbershopsUseCase.ts"
Cohesion: 0.07
Nodes (31): forgotPasswordSchema, googleLoginSchema, loginSchema, phoneBR, registerSchema, registerWithGoogleSchema, resetPasswordSchema, scheduleItemSchema (+23 more)

### Community 65 - "ListQueueController.ts"
Cohesion: 0.13
Nodes (8): MercadoPagoService, injectable, inject, inject, GetPaymentStatusController, GetPaymentStatusUseCase, inject, injectable

### Community 66 - "Google Cloud Storage — setup AgendAI"
Cohesion: 0.50
Nodes (4): Admin — Planos, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/plans` 🔒 🛡️ `MASTER_ADMIN`

### Community 67 - "13. Regras de Negócio Críticas"
Cohesion: 0.09
Nodes (12): FiadoController, IFiadoRepository, AddFiadoPaymentUseCase, ChargeFiadoUseCase, CreateFiadoUseCase, DeleteFiadoUseCase, GetFiadoSummaryUseCase, GetFiadoUseCase (+4 more)

### Community 68 - "Fiado"
Cohesion: 0.17
Nodes (12): AddFiadoPaymentInput, addFiadoPaymentSchema, ChargeFiadoInput, chargeFiadoSchema, CreateFiadoInput, createFiadoPaymentSchema, createFiadoSchema, ListFiadoQueryInput (+4 more)

### Community 70 - "CheckInAppointmentController.ts"
Cohesion: 0.27
Nodes (8): createPublicAppointmentToken(), PublicAppointmentPayload, PublicPurpose, readPublicAppointmentToken(), appointmentInstant(), getAppointment(), logger, PublicAppointmentManagementUseCase

### Community 71 - "PlansController.ts"
Cohesion: 0.09
Nodes (13): RecurringPackageController, CreateClientRecurringPackageInput, createClientRecurringPackageSchema, CreateRecurringPackagePlanInput, createRecurringPackagePlanSchema, RecordPaymentInput, recordPaymentSchema, RecurringPackageListQueryInput (+5 more)

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.50
Nodes (4): Assinaturas, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `GET /subscriptions/me` 🔒, `POST /subscriptions` 🔒 🛡️ `MASTER_ADMIN, OWNER`

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.20
Nodes (11): ExpenseRow, ExpenseWithCategory, FiadoRow, FiadoWithPayments, BarbershopInsightsDTO, GetBarbershopInsightsUseCase, InsightsPeriod, normalizeWhatsapp() (+3 more)

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.07
Nodes (11): ProfitController, ProfitRepository, profitByServiceQuerySchema, profitByStaffQuerySchema, profitComputeSchema, profitManualAdjustmentSchema, profitPeriodQuerySchema, ProfitSettingsInput (+3 more)

### Community 75 - "dependencies"
Cohesion: 0.14
Nodes (10): IRegisterGoogleDTO, RegisterGoogleUseCase, BASE_INPUT, mockFindFirst, mockTransaction, mockTxBarbershopCreate, mockTxUserCreate, mockVerifyIdToken (+2 more)

### Community 76 - "Passo a passo"
Cohesion: 0.15
Nodes (16): setupSwagger(), buildApp(), handleAppError(), correlationIdMiddleware(), registerRoutes(), errorMessage(), INVALID_IDENTIFIER_CODES, isPrismaInvalidUuidError() (+8 more)

### Community 78 - "Pagamentos"
Cohesion: 0.32
Nodes (6): planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 80 - "7. Sistema de Assinaturas e Bloqueio de CPF"
Cohesion: 0.41
Nodes (7): FiadoStatus, ICreateFiadoDTO, ICreateFiadoPaymentDTO, IFiadoListQuery, IFiadoPaymentResponseDTO, IFiadoSummary, IUpdateFiadoDTO

### Community 81 - "Apêndice B — Endpoints por Role"
Cohesion: 0.12
Nodes (13): mockBarbershopFindUnique, mockBroadcast, mockFeedPostCount, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostFindUnique, mockFeedPostUpdate, mockFeedPostUpdateMany (+5 more)

### Community 82 - "Agendamentos"
Cohesion: 0.14
Nodes (17): RequestingUser, CachedWeatherProvider, forecast, redis, MetNoPeriod, MetNoPoint, MetNoWeatherProvider, parseMetNoForecast() (+9 more)

### Community 83 - "Fila (Queue)"
Cohesion: 0.20
Nodes (16): catalogListQuerySchema, comboItemSchema, createAddonSchema, createComboSchema, createVariationSchema, updateAddonSchema, updateComboItemSchema, updateComboSchema (+8 more)

### Community 84 - "Serviços"
Cohesion: 0.48
Nodes (4): requireOpenShopWhatsAppInstance(), whatsAppAppError(), whatsAppNotConnectedError(), assertShopWhatsAppConnected()

### Community 85 - "setup-gcs.sh"
Cohesion: 0.18
Nodes (11): 9. Como Criar um Novo Módulo, Passo 10 — Schema Prisma, Passo 1 — DTOs, Passo 2 — Interface do Repositório, Passo 3 — Mock Repository (para testes), Passo 4 — Implementação Prisma, Passo 5 — Schemas Zod, Passo 6 — UseCases (+3 more)

### Community 86 - "VerifyEmailController.ts"
Cohesion: 0.13
Nodes (6): CreatePackageData, CreatePlanData, RecordPaymentData, RecurringPackageListFilters, UpdatePlanData, RecurringPackageUseCases

### Community 87 - "PlansController"
Cohesion: 0.18
Nodes (10): Achados e correções aplicadas neste ciclo, Casos executáveis (inclusos no plano), Casos manuais → automatizados, Controles validados (sem achado novo), Inventário Graphify, Limitações, PENTEST-AUTH-001 — Authorization sem validação de scheme `Bearer` (corrigido), PENTEST-AUTH-002 — Refresh JWT sem `jti` podia colidir no mesmo segundo (corrigido) (+2 more)

### Community 88 - "StaffUserController"
Cohesion: 0.18
Nodes (11): Barbearias, `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋, `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`, Logo — Fluxo via Signed URL (recomendado para produção), Logo — Upload Direto via Multipart (mais simples) (+3 more)

### Community 89 - "CrmController"
Cohesion: 0.06
Nodes (37): IBillingAddressDTO, ICardPayerDTO, ICreateCardPaymentDTO, ICreatePixPaymentDTO, IMercadoPagoWebhookDTO, IPaymentResponseDTO, IPixQrCodeDTO, PaymentMethod (+29 more)

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
Cohesion: 0.21
Nodes (17): getNotificationV2Mode(), loadNotificationPayload(), sanitizeNotificationError(), dispatchBatch(), dispatchNotificationOutboxNow(), logger, nextBackoff(), startNotificationDispatcher() (+9 more)

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
Cohesion: 0.08
Nodes (42): findExisting(), NotificationPayload, NotificationV2Mode, recordTerminalNotificationFailure(), resolveSkipReason(), retryNotification(), scheduleNotification(), ScheduleNotificationInput (+34 more)

### Community 101 - "Assinaturas"
Cohesion: 0.07
Nodes (15): PricingController, CreateInput, PricingRepository, ruleSelect, UpdateInput, createPricingRuleSchema, evaluatePriceSchema, pricingRuleTypeMap (+7 more)

### Community 102 - "Auth"
Cohesion: 0.12
Nodes (11): CashMovementController, CashMovementQueryInput, cashMovementQuerySchema, CashSummaryQueryInput, cashSummaryQuerySchema, CreateCashMovementInput, createCashMovementSchema, dailyDateQuery (+3 more)

### Community 103 - "Financeiro da Barbearia"
Cohesion: 0.11
Nodes (8): TeamController, AcceptInvitationUseCase, hashToken(), logger, profileSchema, IHashProvider, BcryptHashProvider, MockHashProvider

### Community 104 - "fastify.d.ts"
Cohesion: 0.25
Nodes (7): mockBarbershopFindMany, mockBarbershopUpdate, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostUpdateMany, mockScheduleFindFirst, mockServiceFindMany

### Community 105 - "bcryptjs"
Cohesion: 0.25
Nodes (6): Alternativa: `GCS_CREDENTIALS_JSON`, Google Cloud Storage — setup Agenda Já, Produção (Cloud Run / GKE), Pré-requisitos, Rotação de chave, Scripts relacionados

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
Cohesion: 0.22
Nodes (5): allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessWebhookController

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
Cohesion: 0.10
Nodes (17): CronLogger, scheduleDepositExpiration(), ChargeTrialEndedSubscriptionsUseCase, injectable, CronLogger, scheduleWaitlistExpiration(), CronLogger, scheduleAppointmentReminders() (+9 more)

### Community 128 - "tsup"
Cohesion: 0.10
Nodes (26): getMonitoringDashboard(), hoursAgo(), minutesAgo(), getNotificationOperationsHealth(), heartbeatStatus(), ProcessRole, logger, RedisRateLimitStore (+18 more)

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
Cohesion: 0.18
Nodes (7): GoogleLoginUseCase, mockFindByEmail, mockUser, mockVerifyIdToken, prismaMock, inject, injectable

### Community 138 - "disposable-email-domains.d.ts"
Cohesion: 0.07
Nodes (39): AdminUserController, BlockedEntityAdminController, BlockInput, blockSchema, UnblockInput, unblockSchema, logger, logger (+31 more)

### Community 139 - "setup.ts"
Cohesion: 0.50
Nodes (4): Admin — Barbearias, `GET /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/barbershops/:id/status` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`

### Community 140 - "vitest.config.mts"
Cohesion: 0.06
Nodes (31): DeleteQueueItemController, DeleteQueueItemUseCase, inject, injectable, buildQueueCalledMessage(), buildQueueCancelledMessage(), buildQueueJoinedMessage(), notifyCustomerJoinedQueue() (+23 more)

### Community 142 - "GoogleLoginUseCase"
Cohesion: 0.50
Nodes (4): Financeiro da Barbearia, `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋

### Community 145 - "sendWhatsAppMessage"
Cohesion: 0.53
Nodes (4): nextAttempt(), reconcilePendingRefunds(), CronLog, scheduleRefundReconciliation()

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
Nodes (11): 1. Criar conta no Cloudinary, 2. Copiar credenciais, 3. Adicionar ao `.env`, 4. (Opcional) Criar pasta folders, Cloudinary — Fallback de Storage Agenda Já, Como funciona o fallback, Comportamento por cenário, Notas técnicas (+3 more)

### Community 154 - "PENTEST_REPORT_TEMPLATE.md"
Cohesion: 0.24
Nodes (8): CloseoutQueryInput, closeoutQuerySchema, CloseoutRangeQueryInput, closeoutRangeQuerySchema, CreateCloseoutInput, createCloseoutSchema, dateValue, decimalString

### Community 156 - "@prisma/adapter-pg"
Cohesion: 0.21
Nodes (8): assertSameBarbershop(), buildPostImage(), defaultCtaText(), loadExternalImageUrl(), loadMediaDataUrl(), loadPostContext(), PostsController, toPostResponse()

### Community 157 - "@testcontainers/postgresql"
Cohesion: 0.10
Nodes (16): createBarbershopSchema, phoneBR, scheduleItemSchema, updateBarbershopSchema, updateScheduleSchema, CreateBarbershopController, CreateBarbershopUseCase, inject (+8 more)

### Community 159 - "app.security.spec.ts"
Cohesion: 0.24
Nodes (5): prismaMock, UpdateTaskUseCase, VALID_TASK_TRANSITIONS, UpdateTicketUseCase, VALID_TRANSITIONS

### Community 160 - "AdminDashboardController.ts"
Cohesion: 0.25
Nodes (6): AdminFinancialController, EnrichedBarbershop, ExpenseRow, FiadoRow, FiadoSummaryRow, remainingFiado()

### Community 161 - "IQueueRepository"
Cohesion: 0.19
Nodes (15): productTypeWhere(), enrichExpiration(), ProductListItem, stripCost(), assertUniqueProductCode(), isProductUniqueViolation(), normalizeCode(), throwProductUniqueViolation() (+7 more)

### Community 162 - "issueAuthSession.ts"
Cohesion: 0.13
Nodes (9): IBarbershopRepository, GetScheduleController, GetScheduleUseCase, inject, injectable, UpdateScheduleController, inject, injectable (+1 more)

### Community 163 - "AsaasService.ts"
Cohesion: 0.24
Nodes (4): DeleteServiceController, DeleteServiceUseCase, inject, injectable

### Community 164 - "sendWhatsAppMessage"
Cohesion: 0.27
Nodes (5): connectSchema, WhatsAppConnectionController, inject, injectable, WhatsAppConnectionUseCase

### Community 166 - "ExportUserDataUseCase"
Cohesion: 0.10
Nodes (9): ReputationController, ReputationRepository, reputationSelect, RespondInput, reviewResponseSelect, reputationQuerySchema, respondToReviewSchema, ReputationUseCases (+1 more)

### Community 167 - "AdminNotificationController.ts"
Cohesion: 0.07
Nodes (27): CrmController, resolveCampaignClientIds(), resolveShop(), CrmCampaignListItem, CrmClientMetrics, CrmOverviewDTO, CrmSegment, buildClientMetrics() (+19 more)

### Community 169 - "google-auth-library"
Cohesion: 0.13
Nodes (8): CopilotRepository, suggestionSelect, acceptSchema, copilotSuggestionTypeMap, dismissSchema, listSuggestionsSchema, markReadSchema, ListQuery

### Community 171 - "JoinQueueController.ts"
Cohesion: 0.12
Nodes (13): BusinessSegment, IBarbershopResponseDTO, ManualShopStatus, OpeningMode, ShopOpenStateDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO, BarbershopRepository (+5 more)

### Community 173 - "@opentelemetry/resources"
Cohesion: 0.22
Nodes (6): logger, LoginUseCase, inject, injectable, UserLike, UserWithEmailPassword

### Community 174 - "@opentelemetry/sdk-node"
Cohesion: 0.28
Nodes (4): createServiceSchema, updateServiceSchema, CreateServiceController, UpdateServiceController

### Community 175 - "@opentelemetry/semantic-conventions"
Cohesion: 0.22
Nodes (7): CheckInAppointmentController, checkInSchema, CheckInAppointmentUseCase, ICheckInDTO, ICheckInResult, logger, injectable

### Community 176 - "pino"
Cohesion: 0.39
Nodes (8): backfillDailyWeatherLog(), CronLogger, fetchOpenMeteoLogDay(), finite(), getForecastForDate(), populateDailyWeatherLog(), scheduleDailyWeatherLog(), spDayBounds()

### Community 177 - "@sentry/node"
Cohesion: 0.20
Nodes (4): prisma, { PrismaClient }, { randomUUID }, AdvisoryLock

### Community 178 - "ListSubscriptionsController"
Cohesion: 0.17
Nodes (18): availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR, slotsQuerySchema, timeField (+10 more)

### Community 179 - "queue.spec.ts"
Cohesion: 0.15
Nodes (7): IFiadoResponseDTO, FiadoPaymentRecord, FiadoWithPayments, mapFiadoToDTO(), mapPaymentToDTO(), FiadoRepository, MockFiadoRepository

### Community 181 - "ForgotPasswordUseCase"
Cohesion: 0.30
Nodes (11): backfillCrmLedger(), EventInput, recordAppointmentCompletion(), recordCrmFinancialEvent(), recordFiadoCreated(), recordFiadoPayment(), recordPackageSale(), recordQueueCompletion() (+3 more)

### Community 182 - "payments.routes.ts"
Cohesion: 0.22
Nodes (9): Fiado / despesas / comissões, Fila / agenda / híbrido, Notificações, Pacotes, Pagamentos, Produtos / estoque / retail, Regras de negócio — Backend, Tenant, permissões, RLS (+1 more)

### Community 183 - "payments.routes.ts"
Cohesion: 0.33
Nodes (6): assertShopAccess(), idSchema, manualStatusSchema, queueStatusSchema, shopPayload(), ShopStatusController

### Community 184 - "AdminBarbershopController"
Cohesion: 0.19
Nodes (16): addFieldSchema, createFormSchema, formFieldTypeEnum, formListQuerySchema, formResponseListQuerySchema, formTypeEnum, submitResponseSchema, updateFieldSchema (+8 more)

### Community 185 - "ResetPasswordUseCase"
Cohesion: 0.16
Nodes (13): AttentionItem, AttentionProductSnap, AttentionPurpose, AttentionSaleRow, buildProductAttention(), daysOfCover(), periodDays(), ProductAttention (+5 more)

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
Cohesion: 0.29
Nodes (6): 1. Alterada, 2. Exceção técnica (preservadas, deliberadas), 3. Histórico preservado, 4. Publicação coordenada (ações fora do código), 5. Validação executada, Inventário de marca — Agenda Já (backend)

### Community 202 - "assertOperationEnabled.ts"
Cohesion: 0.08
Nodes (17): DeleteBarbershopController, DeleteBarbershopUseCase, inject, injectable, GetBarbershopController, GetBarbershopUseCase, inject, injectable (+9 more)

### Community 203 - "index.ts"
Cohesion: 0.16
Nodes (12): ICommissionEntryDTO, ICommissionSplitDTO, ICommissionSummary, IListCommissionsQuery, CommissionRepository, CommissionWithRelations, dateFilter(), include (+4 more)

### Community 204 - "CancelSubscriptionController.ts"
Cohesion: 0.29
Nodes (7): 1. Projeto GCP, 2. Variáveis no `.env`, 3. Criar Service Account + chave JSON, 4. Bucket, CORS, IAM público e pastas, 5. Rodar a API, 6. Smoke test, Passo a passo

### Community 205 - "check-docs.mjs"
Cohesion: 0.25
Nodes (5): entryFiles, errors, modulesDir, pkg, root

### Community 206 - "ProcessAsaasWebhookUseCase.ts"
Cohesion: 0.16
Nodes (8): ExpenseCategoryController, expenseCatRepo, ServiceCategoryController, serviceCatRepo, createExpenseCategorySchema, createServiceCategorySchema, updateExpenseCategorySchema, updateServiceCategorySchema

### Community 207 - "ExportFinancialDataUseCase.ts"
Cohesion: 0.52
Nodes (5): attachBarbershopSchema, createOrganizationSchema, inviteMemberSchema, updateMemberRoleSchema, updateOrganizationSchema

### Community 208 - "resendWebhookService.ts"
Cohesion: 0.12
Nodes (13): IRegisterDTO, RegisterUseCase, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate (+5 more)

### Community 209 - "GetPaymentStatusUseCase"
Cohesion: 0.33
Nodes (6): Apêndice B — Endpoints por Role, MASTER_ADMIN only, OWNER + EMPLOYEE + MASTER_ADMIN, OWNER + MASTER_ADMIN, OWNER only, Público (sem autenticação)

### Community 210 - "AGENTS.md — AgendAI Backend"
Cohesion: 0.18
Nodes (11): 0. Regras essenciais, 1. O que é esta API, 2. Inventários locais, 3. Comandos frequentes, 5. Checklist de mudança, 6. Bugs conhecidos fora de escopo, AGENTS.md — Agenda Já Backend, ⚠️ Cuidado: Queries com comparação entre colunas (+3 more)

### Community 212 - "Arquitetura backend — Clean Architecture e SOLID"
Cohesion: 0.33
Nodes (5): Arquitetura backend — Clean Architecture e SOLID, Fluxo de execução vs direção das dependências, Responsabilidades, SOLID (exemplos locais), Transações

### Community 213 - "queueDuplicate.ts"
Cohesion: 0.11
Nodes (20): isSyntheticSalonClientWhatsapp(), salonClientCrmKey(), salonClientDisplayName(), salonClientWhatsappKey(), SalonClientWriter, upsertSalonClientRecord(), updateQueueItemSchema, notifyQueueCapacity() (+12 more)

### Community 214 - "Estrutura — Backend (`agendai-back-end`)"
Cohesion: 0.25
Nodes (7): CreateInput, entrySelect, publicEntrySelect, UpdateInput, imageAuthorizationMap, showcaseModeMap, showcaseStatusMap

### Community 216 - "CheckInAppointmentUseCase.ts"
Cohesion: 0.24
Nodes (11): assignServiceSchema, deleteScheduleSchema, removeServiceSchema, requestTimeOffSchema, timeOffQuerySchema, timeOffStatusEnum, upsertScheduleSchema, AssignServiceInput (+3 more)

### Community 218 - "onboarding.routes.ts"
Cohesion: 0.40
Nodes (3): ResendVerificationEmailController, ResendVerificationEmailUseCase, injectable

### Community 219 - "verifyRecaptcha.ts"
Cohesion: 0.10
Nodes (14): classifyMaturity(), confidenceInterval(), DemandPredictor, FEATURE_NAMES, finite(), MaturityLevel, RECOMMENDATIONS, walkForwardBacktest() (+6 more)

### Community 220 - "ResetPasswordUseCase"
Cohesion: 0.30
Nodes (5): BarbershopFinancialController, GetWeatherInsightsUseCase, inject, injectable, withShopContext()

### Community 221 - "notifications.routes.ts"
Cohesion: 0.29
Nodes (10): createShowcaseEntrySchema, showcaseEventQuerySchema, showcaseListQuerySchema, showcaseOrderSchema, updateShowcaseEntrySchema, CreateInput, EventQuery, ListQuery (+2 more)

### Community 226 - "users.routes.ts"
Cohesion: 0.40
Nodes (5): logger, RECAPTCHA_MIN_SCORE, RecaptchaResponse, verifyRecaptcha(), verifyToken()

### Community 227 - "CrmController.ts"
Cohesion: 0.40
Nodes (5): 14.0 E-mail (Resend) + Indicação, 14.1 Mercado Pago, 14.2 Google Cloud Storage, 14.3 Variáveis de Ambiente Obrigatórias em Produção, 14. Integrações Externas

### Community 228 - "ListSubscriptionsController"
Cohesion: 0.22
Nodes (8): A12 pricing + catalog, A13 purchasing ↔ InventoryEngine, A14 corporate, Contrato / WIP, Decisões novas (2026-09-26), Onda 3 (altos), P0 / dinheiro e takeover, Status da auditoria 15–16/09/2026

### Community 230 - "emailWorker.ts"
Cohesion: 0.40
Nodes (4): Checkout de assinatura (implementado), Domínios → persistência (visão), Mapa de domínio — Backend, Testes

### Community 237 - "GetWeatherForecastUseCase.ts"
Cohesion: 0.36
Nodes (8): checkDatabase(), checkMigrations(), checkRedis(), healthRoutes(), getStorageHealthStatus(), isCloudinaryConfigured(), isGcsConfigured(), StorageHealthStatus

### Community 241 - "@opentelemetry/instrumentation-fastify"
Cohesion: 0.33
Nodes (5): Estrutura — Backend (`agendai-back-end`), Middlewares, Módulos (`src/modules/`), Providers / integrações (arquivos), Rotas HTTP (`shared/infra/http/routes/`)

### Community 242 - "CancelSubscriptionController.ts"
Cohesion: 0.29
Nodes (4): issueProratedRefundMock, prismaMock, cancelReasonSchema, CancelSubscriptionController

### Community 243 - "paymentProviderSnapshot.ts"
Cohesion: 0.13
Nodes (8): CashMovementFilters, CashMovementRepository, CreateCashMovementData, DailyCloseoutData, DailyCloseoutRepository, DailyCloseoutResponse, CloseoutPayload, DailyCloseoutUseCases

### Community 244 - "GetCrmForecastUseCase"
Cohesion: 0.20
Nodes (9): addonSelect, comboSelect, CreateAddon, CreateCombo, CreateVariation, UpdateAddon, UpdateCombo, UpdateVariation (+1 more)

### Community 246 - "RecordActivationEventUseCase"
Cohesion: 0.29
Nodes (4): ListServicesController, ListServicesUseCase, inject, injectable

### Community 247 - "reconciliationService.ts"
Cohesion: 0.33
Nodes (4): GetWeatherForecastController, GetWeatherForecastUseCase, inject, injectable

### Community 248 - "@fastify/cors"
Cohesion: 0.33
Nodes (4): GetServiceController, GetServiceUseCase, inject, injectable

### Community 249 - "PlansController"
Cohesion: 0.50
Nodes (3): Comandos, Graphify — Backend, Procedimento obrigatório

### Community 250 - "ListSubscriptionsController"
Cohesion: 0.50
Nodes (4): Auth, `GET /auth/me` 🔒, `POST /auth/login`, `POST /auth/refresh`

### Community 252 - "GoogleLoginUseCase"
Cohesion: 0.50
Nodes (4): Fluxo de assinatura, Sistema de Assinaturas, Status de assinatura, Trial

### Community 257 - "IntegrationRepository"
Cohesion: 0.40
Nodes (5): 11.1 Configuração, 11.2 Padrão de teste, 11.3 Executar testes, 11.4 O que deve ser testado, 11. Testes

### Community 258 - "14. Integrações Externas"
Cohesion: 0.21
Nodes (6): GetOnboardingProgressUseCase, injectable, OnboardingProgressController, injectable, UpdateOnboardingProgressDTO, UpdateOnboardingProgressUseCase

### Community 262 - "formRepository.ts"
Cohesion: 0.25
Nodes (7): AddFieldInput, CreateFormInput, formSelect, responseSelect, SubmitResponseInput, UpdateFieldInput, UpdateFormInput

### Community 266 - "Sistema de Assinaturas"
Cohesion: 0.10
Nodes (18): AsaasBillingType, AsaasCustomer, AsaasPayment, AsaasPixQrCode, AsaasRefund, logger, computeProratedAmount(), findApprovedPayment() (+10 more)

### Community 267 - "staffRepository.ts"
Cohesion: 0.29
Nodes (6): AssignServiceInput, RequestTimeOffInput, scheduleSelect, serviceSelect, timeOffSelect, UpsertScheduleInput

### Community 273 - "blockedEntitySchemas.ts"
Cohesion: 0.08
Nodes (27): logger, logger, broadcastPostToClients(), logger, mockEnqueue, mockFindMany, mockFindUnique, logger (+19 more)

### Community 298 - "WorkSummaryController.ts"
Cohesion: 0.10
Nodes (15): AdminAuditLogController, AdminDashboardController, formatLabel(), generateTimeSlots(), getPeriodConfig(), Period, AdminNotificationController, AdminReferralsController (+7 more)

### Community 300 - "productsInventory.ts"
Cohesion: 0.40
Nodes (3): listPostTemplates(), POST_TEMPLATES, TemplateGroup

### Community 301 - "cleanOldLogs.cron.ts"
Cohesion: 0.38
Nodes (3): insideRlsTx, rlsExtension, RequestContext

## Knowledge Gaps
- **1127 isolated node(s):** `docker-entrypoint.sh script`, `args`, `base`, `token`, `shopId` (+1122 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **53 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `IUserResponseDTO` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `IBarbershopRepository`, `AppError`, `💈 AgendAI — Backend API`, `IBarbershopResponseDTO`, `normalizeCpf`, `IStorageProvider`, `appointments.spec.ts`, `auth.routes.ts`, `MercadoPagoService`, `RegisterUseCase.ts`, `IPaymentDTO.ts`, `IPaymentResponseDTO`, `SubscribeUseCase.ts`, `AgendAI Back‑end — Manual do Sistema`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `LogoController.ts`, `emailWorker.ts`, `paymentSchemas.ts`, `monitor-routes.js`, `scripts`, `planEconomics.ts`, `index.ts`, `Referência Completa de Rotas`, `appointmentUseCases.ts`, `index.ts`, `ContactController.ts`, `CreateBarbershopUseCase`, `server.ts`, `QueueRepository`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `GetQueueMetricsUseCase`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `app.ts`, `ListBarbershopsUseCase.ts`, `Fiado`, `CheckInAppointmentController.ts`, `PlansController.ts`, `6. Sistema de Autenticação e Autorização`, `8. Banco de Dados e Prisma`, `Passo a passo`, `Pagamentos`, `7. Sistema de Assinaturas e Bloqueio de CPF`, `Agendamentos`, `Fila (Queue)`, `Serviços`, `VerifyEmailController.ts`, `CrmController`, `Admin — Entidades Bloqueadas`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `Auth`, `Financeiro da Barbearia`, `@fastify/multipart`, `ProcessAbacateWebhookController.ts`, `disposable-email-domains.d.ts`, `vitest.config.mts`, `Pentest local — inputs, upload, XSS e exposição pública`, `UpdateBarbershopUseCase`, `QueueRepository`, `app.security.spec.ts`, `AdminDashboardController.ts`, `IQueueRepository`, `ExportUserDataUseCase`, `AdminNotificationController.ts`, `google-auth-library`, `JoinQueueController.ts`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `payments.routes.ts`, `AdminBarbershopController`, `bruteForceProtection.spec.ts`, `@fastify/rate-limit`, `pg`, `Runbook: Aplicar migrations do backend em Staging/Produção`, `assertOperationEnabled.ts`, `index.ts`, `ProcessAsaasWebhookUseCase.ts`, `queueDuplicate.ts`, `Estrutura — Backend (`agendai-back-end`)`, `CheckInAppointmentUseCase.ts`, `notifications.routes.ts`, `users.routes.ts`, `DailyCloseoutController`, `CancelSubscriptionController.ts`, `paymentProviderSnapshot.ts`, `GetCrmForecastUseCase`, `@fastify/cors`, `14. Integrações Externas`, `formRepository.ts`, `Sistema de Assinaturas`, `staffRepository.ts`, `blockedEntitySchemas.ts`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Why does `prisma` connect `IUserResponseDTO` to `api.ts`, `IFiadoResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `AppError`, `IBarbershopResponseDTO`, `IStorageProvider`, `appointments.spec.ts`, `IPlanResponseDTO`, `auth.routes.ts`, `MercadoPagoService`, `RegisterUseCase.ts`, `SubscribeUseCase.ts`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `LogoController.ts`, `emailWorker.ts`, `IPaymentRepository`, `paymentSchemas.ts`, `monitor-routes.js`, `scripts`, `planEconomics.ts`, `Referência Completa de Rotas`, `appointmentUseCases.ts`, `index.ts`, `.findById`, `ContactController.ts`, `devDependencies`, `CreateBarbershopUseCase`, `server.ts`, `QueueRepository`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `GetQueueMetricsUseCase`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `app.ts`, `ListBarbershopsUseCase.ts`, `CheckInAppointmentController.ts`, `6. Sistema de Autenticação e Autorização`, `Passo a passo`, `Pagamentos`, `7. Sistema de Assinaturas e Bloqueio de CPF`, `VerifyEmailController.ts`, `CrmController`, `Admin — Usuários`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `Financeiro da Barbearia`, `@fastify/multipart`, `zod`, `tsup`, `disposable-email-domains.d.ts`, `vitest.config.mts`, `sendWhatsAppMessage`, `cancelSubscription.spec.ts`, `app.security.spec.ts`, `AdminDashboardController.ts`, `IQueueRepository`, `ExportUserDataUseCase`, `AdminNotificationController.ts`, `google-auth-library`, `JoinQueueController.ts`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `pino`, `queue.spec.ts`, `ForgotPasswordUseCase`, `payments.routes.ts`, `ResetPasswordUseCase`, `Runbook: Aplicar migrations do backend em Staging/Produção`, `assertOperationEnabled.ts`, `index.ts`, `queueDuplicate.ts`, `Estrutura — Backend (`agendai-back-end`)`, `DailyCloseoutController`, `GetWeatherForecastUseCase.ts`, `CancelSubscriptionController.ts`, `paymentProviderSnapshot.ts`, `GetCrmForecastUseCase`, `14. Integrações Externas`, `formRepository.ts`, `Sistema de Assinaturas`, `staffRepository.ts`, `blockedEntitySchemas.ts`, `WorkSummaryController.ts`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `FormRepository` connect `@testcontainers/postgresql` to `AdminBarbershopController`, `formRepository.ts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 58 inferred relationships involving `authenticate()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`authenticate()` has 58 INFERRED edges - model-reasoned connections that need verification._
- **Are the 57 inferred relationships involving `setRlsContext()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`setRlsContext()` has 57 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `args`, `base` to the rest of the system?**
  _1127 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.052545155993431854 - nodes in this community are weakly interconnected._