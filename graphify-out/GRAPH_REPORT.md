# Graph Report - agendai-back-end  (2026-10-03)

## Corpus Check
- 943 files · ~1,680,818 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6271 nodes · 14670 edges · 314 communities (254 shown, 60 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 398 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3371530e`
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
- LogoutController.ts
- verifyRecaptcha.ts
- WhatsAppConnectionUseCase
- subscribe.spec.ts
- IntegrationRepository
- 14. Integrações Externas
- notifications.routes.ts
- paymentProviderSnapshot.ts
- formRepository.ts
- productUseCases.ts
- resourceRepository.ts
- .revokeAllSessions
- Sistema de Assinaturas
- staffRepository.ts
- .constructor
- postPalettes.ts
- CancellationContextUseCase.ts
- LoyaltyRepository
- assertAppointmentBookable.ts
- payments.routes.ts
- ExportUserDataUseCase
- calendar.routes.ts
- catalogTemplates.ts
- uploadImage.spec.ts
- idempotency.spec.ts
- Passo a passo
- subscriptionAccess.ts
- CashMovementController
- categories.routes.ts
- verify-delivery.mjs
- 14. Integrações Externas
- Mapa de domínio — Backend
- Admin — Entidades Bloqueadas
- Graphify — Backend
- Sistema de Assinaturas
- .findIdentityById
- .getPortalHistory
- WorkSummaryController.ts
- productsInventory.ts
- cleanOldLogs.cron.ts
- .revokeAllSessions
- Revisão do lote de e-mails — 2026-09-21
- calendar.routes.ts
- productReservationRoutes.ts
- notifications.routes.ts
- subscriptionAccess.ts
- Inventário de scripts — Backend (`agendai-back-end`)
- DailyCloseoutController
- categories.routes.ts
- verify-post-social-migration.mjs
- README.md

## God Nodes (most connected - your core abstractions)
1. `AppError` - 283 edges
2. `prisma` - 217 edges
3. `authenticate()` - 124 edges
4. `setRlsContext()` - 118 edges
5. `authorize()` - 115 edges
6. `checkSubscription()` - 108 edges
7. `apiRoutes()` - 66 edges
8. `getRedisConnection()` - 66 edges
9. `checkDashboardAccess()` - 63 edges
10. `IBarbershopRepository` - 58 edges

## Surprising Connections (you probably didn't know these)
- `seedDemoData()` --calls--> `seedBarbershopDefaults()`  [EXTRACTED]
  prisma/seed.ts → src/shared/utils/seedBarbershopDefaults.ts
- `seedTenantDefaults()` --calls--> `seedBarbershopDefaults()`  [EXTRACTED]
  prisma/seed.ts → src/shared/utils/seedBarbershopDefaults.ts
- `qualifyReferralOnPayment()` --indirect_call--> `base()`  [INFERRED]
  src/modules/referrals/services/referralService.ts → src/modules/products/catalogTemplates.ts
- `expectAppError()` --indirect_call--> `AppError`  [INFERRED]
  src/modules/products/deleteProduct.spec.ts → src/shared/errors/AppError.ts
- `expectAppError()` --indirect_call--> `AppError`  [INFERRED]
  src/shared/infra/worker/postRenderPool.spec.ts → src/shared/errors/AppError.ts

## Import Cycles
- None detected.

## Communities (314 total, 60 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.12
Nodes (14): IJoinQueueDTO, QueueStatus, IUpdateQueueItemDTO, PrismaQueueStatus, toDTO(), toPrisma(), IQueueRepository, GetQueueMetricsController (+6 more)

### Community 1 - "IFiadoResponseDTO"
Cohesion: 0.04
Nodes (34): TaskController, TicketController, INTERNAL_PROFILE_PERMISSIONS, acceptInvitationSchema, createTaskCommentSchema, createTaskSchema, createTicketCommentSchema, createTicketSchema (+26 more)

### Community 2 - "IServiceResponseDTO"
Cohesion: 0.09
Nodes (19): ProductsController, shopId(), adjustmentSchema, createProductSchema, createReceiptSchema, createRetailSaleSchema, expirationDateSchema, installTemplateSchema (+11 more)

### Community 3 - "PostsController.ts"
Cohesion: 0.08
Nodes (12): inject, inject, inject, logger, ResetPasswordUseCase, inject, injectable, inject (+4 more)

### Community 4 - "IExpenseResponseDTO"
Cohesion: 0.09
Nodes (26): assertPaymentProviderEnabled(), EnabledPaymentProvider, enabledPaymentProviders(), IInvoiceResponseDTO, ISubscribeDTO, ISubscriptionResponseDTO, SubscriptionStatus, AsaasCreditCardInput (+18 more)

### Community 5 - "AbacatePayService"
Cohesion: 0.11
Nodes (14): ICreateServiceDTO, IServiceResponseDTO, IUpdateServiceDTO, MockServiceRepository, ServiceRepository, IServiceRepository, CreateServiceUseCase, inject (+6 more)

### Community 6 - "index.ts"
Cohesion: 0.09
Nodes (36): refreshCrmCampaignStatus(), prismaMock, loadNotificationPayload(), EmailTemplateId, emailDestination(), EmailJobData, emailNotificationType(), emailQueue (+28 more)

### Community 7 - "compilerOptions"
Cohesion: 0.06
Nodes (37): ExpenseController, ExpenseRecurrence, ExpenseType, ICreateExpenseDTO, IExpenseListQuery, IExpenseResponseDTO, IExpenseSummary, IUpdateExpenseDTO (+29 more)

### Community 8 - "IBarbershopRepository"
Cohesion: 0.08
Nodes (45): connectSchema, WhatsAppConnectionController, assertShopAccess(), detachEvolutionInstanceWithTimeout(), ShopWhatsAppDto, ShopWhatsAppStatus, inject, injectable (+37 more)

### Community 9 - "AppError"
Cohesion: 0.07
Nodes (35): billingAddressSchema, cardPayerSchema, CreateCardPaymentInput, createCardPaymentSchema, CreatePixPaymentInput, createPixPaymentSchema, getPaymentStatusSchema, identificationSchema (+27 more)

### Community 10 - "💈 AgendAI — Backend API"
Cohesion: 0.08
Nodes (25): ClientPackageController, resolveBarbershopId(), ServicePackageController, IBookPackageSlotDTO, BookClientPackageInput, bookClientPackageSchema, CreateServicePackageInput, createServicePackageSchema (+17 more)

### Community 11 - "IBarbershopResponseDTO"
Cohesion: 0.10
Nodes (21): ICreateServicePackageDTO, IServicePackageResponseDTO, IUpdateServicePackageDTO, MockServicePackageRepository, include, map(), ServicePackageRepository, IServicePackageRepository (+13 more)

### Community 12 - "normalizeCpf"
Cohesion: 0.11
Nodes (22): getNotificationOperationsHealth(), heartbeatStatus(), broadcastPostToClients(), mockEnqueue, mockFindMany, mockFindUnique, getNotificationQueue(), enqueuePostBroadcast() (+14 more)

### Community 13 - "IStorageProvider"
Cohesion: 0.08
Nodes (25): AuthConfig, issueAuthSession(), mapRole(), UserLike, findUsableRefreshToken(), RefreshTokenResult, LogoutController, LogoutUseCase (+17 more)

### Community 14 - "appointments.spec.ts"
Cohesion: 0.16
Nodes (14): OperationMode, ChangeOperationModeController, ChangeOperationModeDTO, ChangeOperationModeResult, ChangeOperationModeUseCase, inject, injectable, assertOperationEnabled() (+6 more)

### Community 15 - "IPlanResponseDTO"
Cohesion: 0.09
Nodes (35): emptyToUndefined(), Env, envSchema, intVar(), NOTIFICATION_V2_MODES, parseEnv(), PROCESS_ROLES, resolveProcessRole() (+27 more)

### Community 16 - "IAppointmentResponseDTO"
Cohesion: 0.05
Nodes (37): ./*, config/*, dist, dtos/*, ES2022, libs/*, modules/*, node_modules (+29 more)

### Community 17 - "auth.routes.ts"
Cohesion: 0.24
Nodes (10): CreateWaitlistEntryInput, createWaitlistEntrySchema, CreateWaitlistOfferInput, createWaitlistOfferSchema, PublicCreateWaitlistEntryInput, publicCreateWaitlistEntrySchema, UpdateWaitlistEntryInput, updateWaitlistEntrySchema (+2 more)

### Community 18 - "MercadoPagoService"
Cohesion: 0.06
Nodes (16): CorporateController, CorporateRepository, CreatePlanInput, planSelect, subscriptionSelect, UpdatePlanInput, billingCycleMap, corporatePlanStatusMap (+8 more)

### Community 19 - "IUserResponseDTO"
Cohesion: 0.03
Nodes (68): sensitiveRoutes, adapter, AppPrisma, clienteBase, hasSslMode, pool, prisma, EnrichedBarbershop (+60 more)

### Community 20 - "RegisterUseCase.ts"
Cohesion: 0.07
Nodes (30): AppointmentStatus, IAppointmentResponseDTO, IAvailabilitySlotDTO, ICreateAppointmentDTO, IListAppointmentsQuery, IUpdateAppointmentDTO, AppointmentRepository, AppointmentWithRelations (+22 more)

### Community 21 - "IPaymentDTO.ts"
Cohesion: 0.07
Nodes (13): AbacatePayService, injectable, AsaasService, injectable, ProratedRefundInput, CancelPaymentController, CancelPaymentUseCase, inject (+5 more)

### Community 22 - "IPaymentResponseDTO"
Cohesion: 0.09
Nodes (16): AbacateCheckout, AbacateCustomer, AbacateProduct, CreateCheckoutInput, EnsureProductInput, allowInsecureWebhooks(), ProcessAbacateWebhookController, RequestWithRawBody (+8 more)

### Community 23 - "SubscribeUseCase.ts"
Cohesion: 0.04
Nodes (53): BusinessSegment, IBarbershopResponseDTO, ManualShopStatus, OpeningMode, ShopOpenStateDTO, ICreateBarbershopDTO, IUpdateBarbershopDTO, BarbershopRepository (+45 more)

### Community 24 - "AgendAI Back‑end — Manual do Sistema"
Cohesion: 0.10
Nodes (16): ProcedureRecordController, ICreateProcedureRecordDTO, IProcedureRecordResponseDTO, IUpdateProcedureRecordDTO, IProcedureRecordRepository, ProcedureRecordRepository, assertShopAccess(), assertStaffRole() (+8 more)

### Community 25 - "blockedEntityService.ts"
Cohesion: 0.05
Nodes (31): ProductReservationController, staffShopId(), CreateReservedInput, IProductReservationRepository, ProductReservationRepository, ProductReservationRow, PublicProductRow, PublicProductSelectedRow (+23 more)

### Community 26 - "AppointmentController.ts"
Cohesion: 0.16
Nodes (13): assertSameBarbershop(), ENUM_TO_INPUT, FeedController, FeedRow, feedSelect, mocks, row, toResponse() (+5 more)

### Community 27 - "LoginUseCase.ts"
Cohesion: 0.09
Nodes (34): buildPrompt(), callAnthropic(), callDeepseek(), callGemini(), callGroq(), callMistral(), callOpenAI(), DailyLimitExceededError (+26 more)

### Community 28 - "IQueueRepository"
Cohesion: 0.12
Nodes (18): CancellationContextController, CancellationContextResult, CancellationContextUseCase, emptyContext(), GetSubscriptionController, loadActivePlans(), SubscriptionEconomicsController, computePlanEconomics() (+10 more)

### Community 29 - "BarbershopFinancialController.ts"
Cohesion: 0.06
Nodes (21): VisitController, AddItem, CloseTab, CreateVisit, RecordPayment, VisitRepository, visitSelect, addItemSchema (+13 more)

### Community 30 - "queue.spec.ts"
Cohesion: 0.36
Nodes (21): agendaiEmailBase(), brl(), buildAppointmentUrgentCancelledEmail(), buildAppointmentUrgentRescheduledEmail(), buildDailyDigestEmail(), buildPasswordChangedEmail(), buildPaymentApprovedEmail(), buildPaymentFailedEmail() (+13 more)

### Community 31 - "LogoController.ts"
Cohesion: 0.21
Nodes (4): confidenceInterval(), DemandPredictor, finite(), walkForwardBacktest()

### Community 32 - "emailWorker.ts"
Cohesion: 0.11
Nodes (12): ClientPackageStatus, IClientPackageResponseDTO, IPackageSalesSummary, ISellClientPackageDTO, PackagePaymentMethod, ClientPackageRepository, include, map() (+4 more)

### Community 33 - "IPaymentRepository"
Cohesion: 0.18
Nodes (8): ICreatePlanDTO, IPlanResponseDTO, IUpdatePlanDTO, PlanBillingCycle, MockPlanRepository, PlanRepository, select, IPlanRepository

### Community 34 - "paymentSchemas.ts"
Cohesion: 0.11
Nodes (5): IQueueItemResponseDTO, MockQueueRepository, QueueRepository, findMany, QueueWaitEstimate

### Community 35 - "monitor-routes.js"
Cohesion: 0.08
Nodes (25): ICreateUserDTO, RoleLiteral, ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, EmployeePermission, IUserResponseDTO, RoleLiteral, MockUserRepository (+17 more)

### Community 36 - "scripts"
Cohesion: 0.08
Nodes (15): AppointmentController, ADMIN, otherOwner, CancelAppointmentUseCase, CreateAppointmentUseCase, GetAppointmentUseCase, GetAvailabilityUseCase, GetAvailableSlotsUseCase (+7 more)

### Community 37 - "planEconomics.ts"
Cohesion: 0.18
Nodes (18): InventoryEngine, lockProduct(), injectable, Tx, writeMovement(), CatalogProductSnapshot, namesToSkip(), nextStockQty() (+10 more)

### Community 38 - "index.ts"
Cohesion: 0.07
Nodes (14): LoyaltyController, AdjustManualInput, adjustManualSchema, ConfigureLoyaltyProgramInput, configureLoyaltyProgramSchema, RecordCashbackInput, recordCashbackSchema, RecordVisitInput (+6 more)

### Community 39 - "Referência Completa de Rotas"
Cohesion: 0.19
Nodes (7): getCatalogTemplate(), assertProductPermission(), canSeeProductCosts(), COST_PERMISSIONS, ProductActor, ProductCatalogUseCase, injectable

### Community 40 - "appointmentUseCases.ts"
Cohesion: 0.22
Nodes (6): blockOwnerCpfs(), JwtPayload, checkDashboardAccess(), financial, requirePermission(), requirePermission()

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
Cohesion: 0.22
Nodes (18): createSeedClient(), defaultPlans, isDirectExecution(), looksLikeProductionEnvironment(), main(), parseCliArgs(), resolveSeedProfile(), runSeed() (+10 more)

### Community 45 - "index.ts"
Cohesion: 0.18
Nodes (19): getShopOpenState(), utcDateFromYmd(), addDaysYmd(), computeShopOpenState(), ComputeShopOpenStateInput, effectiveManualStatus(), hoursFrom(), ManualShopStatus (+11 more)

### Community 46 - ".findById"
Cohesion: 0.13
Nodes (14): ExpenseCategoryRecord, mapExpenseCategoryToDTO(), mapServiceCategoryToDTO(), ServiceCategoryRecord, ExpenseCategoryRepository, ServiceCategoryRepository, IExpenseCategoryRepository, IServiceCategoryRepository (+6 more)

### Community 47 - "ContactController.ts"
Cohesion: 0.05
Nodes (13): DepositController, ConfirmDepositInput, confirmDepositSchema, DepositListQueryInput, depositListQuerySchema, UpdateDepositPolicyInput, updateDepositPolicySchema, ConfirmDepositData (+5 more)

### Community 48 - "IEmailProvider.ts"
Cohesion: 0.13
Nodes (11): channelName(), closeClient(), DUPLICATE_OPTIONS, isRealtimeEvent(), logger, RealtimeEvent, RealtimeHub, RealtimeTopic (+3 more)

### Community 49 - "devDependencies"
Cohesion: 0.12
Nodes (24): baseInput, formats, legacyPhotoTemplates, newTemplates, promoStockTemplates, badge(), buildPostSvg(), escapeXml() (+16 more)

### Community 50 - "CreateBarbershopUseCase"
Cohesion: 0.10
Nodes (15): SupportController, CreateAdminNotificationData, CreateHistoryData, CreateReportData, generateProtocol(), SupportRepository, addCommentSchema, CreateReportInput (+7 more)

### Community 51 - "server.ts"
Cohesion: 0.06
Nodes (43): ClientController, ICreateSalonClientDTO, ISalonClientAppointmentDTO, ISalonClientListQuery, ISalonClientPackageSummaryDTO, ISalonClientResponseDTO, IUpdateSalonClientDTO, MockSalonClientRepository (+35 more)

### Community 52 - "QueueRepository"
Cohesion: 0.06
Nodes (19): PurchasingController, AddItemInput, CreateOrderInput, itemSelect, orderSelect, PurchasingRepository, ReceiveOrderInput, UpdateOrderInput (+11 more)

### Community 53 - "GcsStorageProvider"
Cohesion: 0.10
Nodes (21): AgendAI Back‑end — Manual do Sistema, Autenticação e Autorização, Banco de Dados (Prisma), Com Docker, Como Adicionar um Novo Caso de Uso/Endpoint, Convenções, Definições, Dicas para IA (+13 more)

### Community 54 - "9. Como Criar um Novo Módulo"
Cohesion: 0.29
Nodes (9): assertUniqueProductCode(), isProductUniqueViolation(), normalizeCode(), throwProductUniqueViolation(), IMPORTANT: Keep in sync with the backfill SQL in, resolveUnitFields(), STOCK_UNIT_LABELS, StockUnit (+1 more)

### Community 55 - "Barbearias"
Cohesion: 0.04
Nodes (48): DeleteLogoUseCase, inject, injectable, GetLogoUploadUrlUseCase, IGetLogoUploadUrlDTO, IGetLogoUploadUrlResult, inject, injectable (+40 more)

### Community 57 - "12. Erros Comuns e Como Evitá-los"
Cohesion: 0.09
Nodes (29): ENUM_TO_INPUT, logger, PostRow, postSelect, createPostSchema, designOptionsSchema, generatePostSchema, getConfigQuerySchema (+21 more)

### Community 58 - "AdminDashboardController.ts"
Cohesion: 0.06
Nodes (19): AppTx, VoucherController, CreateInput, UpdateInput, usageSelect, VoucherRepository, voucherSelect, applyVoucherSchema (+11 more)

### Community 59 - "IAppointmentRepository"
Cohesion: 0.50
Nodes (4): Admin — Assinaturas, `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/subscriptions` 🔒 🛡️ `MASTER_ADMIN`

### Community 60 - "GetQueueMetricsUseCase"
Cohesion: 0.18
Nodes (12): ALLOWED_MIME_SET, logger, UploadVideoController, IUploadVideoDTO, IUploadVideoResult, inject, injectable, UploadVideoUseCase (+4 more)

### Community 61 - "🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI"
Cohesion: 0.14
Nodes (59): activationRoutes(), analyticsRoutes(), ActivationController, reviewRoutes(), mePreHandler(), calendarRoutes(), cashMovementRoutes(), catalogRoutes() (+51 more)

### Community 62 - "Categorias"
Cohesion: 0.17
Nodes (11): 1. Preparação, 2. Pré-validação, 3. Aplicação, 4. Pós-validação, Escala horizontal, Estado conhecido, Falhas e recuperação, Fluxo de deploy (+3 more)

### Community 63 - "app.ts"
Cohesion: 0.07
Nodes (27): AdminAuditLogController, AdminNotificationController, AdminReferralsController, WorkSummaryController, hasInternalPermission(), INTERNAL_PERMISSIONS, InternalPermission, adminAuditLogQuerySchema (+19 more)

### Community 64 - "ListBarbershopsUseCase.ts"
Cohesion: 0.25
Nodes (3): buildAuthProbeApp(), loadRefreshController(), TokenRow

### Community 65 - "ListQueueController.ts"
Cohesion: 0.17
Nodes (17): hashToken(), ResendInvitationUseCase, VerifyEmailController, VerifyEmailUseCase, apiUrl(), buildForgotPasswordEmail(), buildVerifyEmail(), escapeHtml() (+9 more)

### Community 66 - "Google Cloud Storage — setup AgendAI"
Cohesion: 0.50
Nodes (4): Admin — Planos, `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/plans` 🔒 🛡️ `MASTER_ADMIN`

### Community 67 - "13. Regras de Negócio Críticas"
Cohesion: 0.05
Nodes (42): FiadoController, FiadoStatus, ICreateFiadoDTO, ICreateFiadoPaymentDTO, IFiadoListQuery, IFiadoPaymentResponseDTO, IFiadoResponseDTO, IFiadoSummary (+34 more)

### Community 68 - "Fiado"
Cohesion: 0.11
Nodes (13): logger, PipelineResults, RateLimitChildOptions, RateLimitFailureMode, RateLimitStoreCallback, RateLimitStoreResult, RedisRateLimitStore, RedisRateLimitStoreOptions (+5 more)

### Community 70 - "CheckInAppointmentController.ts"
Cohesion: 0.09
Nodes (20): updateQueueItemSchema, inject, buildQueueCalledMessage(), buildQueueCancelledMessage(), buildQueueJoinedMessage(), logger, notifyCustomerJoinedQueue(), NotifyQueuePositionResult (+12 more)

### Community 71 - "PlansController.ts"
Cohesion: 0.09
Nodes (13): RecurringPackageController, CreateClientRecurringPackageInput, createClientRecurringPackageSchema, CreateRecurringPackagePlanInput, createRecurringPackagePlanSchema, RecordPaymentInput, recordPaymentSchema, RecurringPackageListQueryInput (+5 more)

### Community 72 - "enqueueWhatsApp"
Cohesion: 0.50
Nodes (4): Assinaturas, `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER`, `GET /subscriptions/me` 🔒, `POST /subscriptions` 🔒 🛡️ `MASTER_ADMIN, OWNER`

### Community 73 - "6. Sistema de Autenticação e Autorização"
Cohesion: 0.17
Nodes (13): agruparPor(), Calendario, DadosDoLote, GetOrganizationDashboardUseCase, LinhaAgenda, LinhaConcluida, LinhaEscala, LinhaFila (+5 more)

### Community 74 - "8. Banco de Dados e Prisma"
Cohesion: 0.07
Nodes (11): ProfitController, ProfitRepository, profitByServiceQuerySchema, profitByStaffQuerySchema, profitComputeSchema, profitManualAdjustmentSchema, profitPeriodQuerySchema, ProfitSettingsInput (+3 more)

### Community 75 - "dependencies"
Cohesion: 0.13
Nodes (29): minimalInput, renderSvgToPngSync(), resolvePostFontFile(), acquireSlot(), closePostRenderPool(), createSlot(), dispatch(), failQueued() (+21 more)

### Community 76 - "Passo a passo"
Cohesion: 0.10
Nodes (24): setupSwagger(), buildApp(), logger, RATE_LIMIT_ALLOWED_PATHS, resolveTrustProxy(), buildWithTrustProxy(), correlationIdMiddleware(), registerRoutes() (+16 more)

### Community 78 - "Pagamentos"
Cohesion: 0.32
Nodes (6): planSelect, billingCycleSchema, CreatePlanInput, createPlanSchema, UpdatePlanInput, updatePlanSchema

### Community 80 - "7. Sistema de Assinaturas e Bloqueio de CPF"
Cohesion: 0.15
Nodes (22): extractCorrelationIdFromOutbox(), getNotificationV2Mode(), applyOutcome(), BatchOutcome, dispatchBatch(), dispatchNotificationOutboxNow(), logger, nextBackoff() (+14 more)

### Community 81 - "Apêndice B — Endpoints por Role"
Cohesion: 0.12
Nodes (13): mockBarbershopFindUnique, mockBroadcast, mockFeedPostCount, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostFindUnique, mockFeedPostUpdate, mockFeedPostUpdateMany (+5 more)

### Community 82 - "Agendamentos"
Cohesion: 0.19
Nodes (11): inject, CachedWeatherProvider, forecast, redis, DEFAULT_CONDITION, finite(), OpenMeteoWeatherProvider, WMO_CODES (+3 more)

### Community 83 - "Fila (Queue)"
Cohesion: 0.20
Nodes (16): catalogListQuerySchema, comboItemSchema, createAddonSchema, createComboSchema, createVariationSchema, updateAddonSchema, updateComboItemSchema, updateComboSchema (+8 more)

### Community 84 - "Serviços"
Cohesion: 0.13
Nodes (9): IPaymentResponseDTO, MockPaymentRepository, mapToDTO(), PaymentRepository, IUpdatePaymentStatusDTO, makeFullSubscription(), makeSubscription(), NOW (+1 more)

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
Cohesion: 0.21
Nodes (10): classifyResendError(), EmailErrorKind, IEmailProvider, SendEmailInput, SendEmailResult, logger, ResendEmailProvider, { send } (+2 more)

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
Cohesion: 0.11
Nodes (29): BarbershopEmailSettings, canReceiveEmail(), categoryDefaultEnabled(), EMAIL_CATEGORY, emailCategoryLabel(), EmailCategoryValue, EmailPreference, EmailUnsubscribePayload (+21 more)

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
Cohesion: 0.09
Nodes (39): findExisting(), NotificationPayload, NotificationV2Mode, resolveSkipReason(), retryNotification(), scheduleNotification(), ScheduleNotificationInput, uniqueKey() (+31 more)

### Community 101 - "Assinaturas"
Cohesion: 0.07
Nodes (15): PricingController, CreateInput, PricingRepository, ruleSelect, UpdateInput, createPricingRuleSchema, evaluatePriceSchema, pricingRuleTypeMap (+7 more)

### Community 102 - "Auth"
Cohesion: 0.12
Nodes (11): CashMovementController, CashMovementQueryInput, cashMovementQuerySchema, CashSummaryQueryInput, cashSummaryQuerySchema, CreateCashMovementInput, createCashMovementSchema, dailyDateQuery (+3 more)

### Community 103 - "Financeiro da Barbearia"
Cohesion: 0.11
Nodes (12): activeStoryWhere(), CommentRow, PublicPostRow, publishedPostWhere(), SocialRepository, SocialActor, client, owner (+4 more)

### Community 104 - "fastify.d.ts"
Cohesion: 0.22
Nodes (8): mockBarbershopFindMany, mockBarbershopUpdate, mockFeedPostCreate, mockFeedPostFindMany, mockFeedPostUpdateMany, mockScheduleFindFirst, mockServiceFindMany, mockWithCronLock

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
Cohesion: 0.17
Nodes (5): Claude, dependencies, devDependencies, Inventário de pacotes — Backend (agendai-back-end), Gemini

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
Nodes (17): deliverClientOtp(), mocks, ClientPortalController, barbershopIdQuerySchema, CLIENT_PORTAL_OWNER_ROLES, CLIENT_PORTAL_STAFF_ROLES, clientPortalQuerySchema, confirmLinkSchema (+9 more)

### Community 119 - "node-cron"
Cohesion: 0.33
Nodes (6): 3.1 Clean Architecture (simplificada), 3.2 Padrão por módulo, 3.3 Injeção de Dependências, 3.4 Tratamento de Erros, 3.5 Resposta HTTP padrão, 3. Arquitetura e Padrões

### Community 120 - "CreateUserUseCase.ts"
Cohesion: 0.33
Nodes (6): 7.1 Fluxo de acesso, 7.2 Status de Subscription, 7.3 Resposta 402 padronizada, 7.4 Bloqueio automático de CPF, 7.5 Serviço de bloqueio, 7. Sistema de Assinaturas e Bloqueio de CPF

### Community 121 - "@prisma/client"
Cohesion: 0.21
Nodes (7): allowInsecureWebhooks(), ProcessAsaasWebhookController, timingSafeStringEqual(), IAsaasWebhookPayload, ProcessAsaasWebhookUseCase, inject, injectable

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
Cohesion: 0.05
Nodes (56): CronLogger, scheduleDepositExpiration(), pngToDataUrl(), renderPostSvgToPng(), ChargeTrialEndedSubscriptionsUseCase, injectable, CronLogger, scheduleWaitlistExpiration() (+48 more)

### Community 128 - "tsup"
Cohesion: 0.06
Nodes (36): forgotPasswordSchema, googleLoginSchema, loginSchema, phoneBR, refreshSchema, registerSchema, registerWithGoogleSchema, resetPasswordSchema (+28 more)

### Community 131 - "@types/node"
Cohesion: 0.18
Nodes (12): adminCreateBarbershopSchema, adminCreateUserSchema, adminListBarbershopsQuerySchema, adminListBlockedEntitiesQuerySchema, adminListSubscriptionsQuerySchema, adminListUsersQuerySchema, adminUpdateBarbershopStatusSchema, adminUpdateUserSchema (+4 more)

### Community 132 - "@types/node-cron"
Cohesion: 0.40
Nodes (5): 5.1 Importações, 5.2 Nomenclatura, 5.3 Tipos, 5.4 Async/Await, 5. Convenções de Código

### Community 133 - "authSchemas.ts"
Cohesion: 0.20
Nodes (13): authenticateSocialActor(), socialRoutes(), mock, source, walletRoutes(), extractBearerToken(), authenticateClient(), extractBearerToken() (+5 more)

### Community 134 - "vite-tsconfig-paths"
Cohesion: 0.40
Nodes (5): Admin — Notificações, `GET /admin/notifications` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/notifications/unread-count` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/notifications/:id/read` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/notifications/read-all` 🔒 🛡️ `MASTER_ADMIN`

### Community 135 - "vitest"
Cohesion: 0.40
Nodes (5): Admin — Usuários, `DELETE /admin/users/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/users` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/users/:id` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/users` 🔒 🛡️ `MASTER_ADMIN`

### Community 136 - "ensure-gcs-key.sh"
Cohesion: 0.06
Nodes (34): 0. Correções aos pressupostos do plano original, 10.1 Incidente #1 — `directUrl` exige neutralização dupla, 10.2 Incidente #2 — drift em produção, 10.3 Correção aplicada, 10.4 Checksums do `_prisma_migrations` — hipótese refutada, 10.5 B5 concluído — `BYPASSRLS` confirmado (fecha P0-7), 10.6 Estado de sincronismo dos bancos, 10.7 Itens abertos (+26 more)

### Community 138 - "disposable-email-domains.d.ts"
Cohesion: 0.08
Nodes (34): AdminUserController, BlockedEntityAdminController, BlockInput, blockSchema, UnblockInput, unblockSchema, logger, logger (+26 more)

### Community 139 - "setup.ts"
Cohesion: 0.50
Nodes (4): Admin — Barbearias, `GET /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`, `PATCH /admin/barbershops/:id/status` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`

### Community 140 - "vitest.config.mts"
Cohesion: 0.10
Nodes (16): DeleteQueueItemController, DeleteQueueItemUseCase, injectable, CommissionSplit, ProcedureInput, RetailSalePayload, computeInsertJoinedAt(), ALLOWED_TRANSITIONS (+8 more)

### Community 142 - "GoogleLoginUseCase"
Cohesion: 0.50
Nodes (4): Financeiro da Barbearia, `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋, `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋

### Community 143 - "Pentest local — auth, sessão, pagamentos e webhooks (21 ago 2026)"
Cohesion: 0.50
Nodes (4): createMockRedis(), globToRegExp(), mockRedis, redisStore

### Community 145 - "sendWhatsAppMessage"
Cohesion: 0.05
Nodes (40): IBillingAddressDTO, ICardPayerDTO, ICreateCardPaymentDTO, ICreatePixPaymentDTO, IMercadoPagoWebhookDTO, IPixQrCodeDTO, PaymentMethod, PaymentProvider (+32 more)

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

### Community 153 - "cancelSubscription.spec.ts"
Cohesion: 0.20
Nodes (7): GoogleLoginUseCase, mockFindByEmail, mockUser, mockVerifyIdToken, prismaMock, inject, injectable

### Community 154 - "PENTEST_REPORT_TEMPLATE.md"
Cohesion: 0.24
Nodes (8): CloseoutQueryInput, closeoutQuerySchema, CloseoutRangeQueryInput, closeoutRangeQuerySchema, CreateCloseoutInput, createCloseoutSchema, dateValue, decimalString

### Community 156 - "@prisma/adapter-pg"
Cohesion: 0.19
Nodes (10): assertRequiredPostMedia(), assertSameBarbershop(), buildPostImage(), defaultCtaText(), loadExternalImageUrl(), loadMediaDataUrl(), loadPostContext(), PostsController (+2 more)

### Community 157 - "@testcontainers/postgresql"
Cohesion: 0.14
Nodes (11): AdminBarbershopController, DEFAULT_EXPENSE_CATEGORIES, DEFAULT_PRODUCT_CATEGORIES, DEFAULT_SCHEDULE, DEFAULT_SERVICE_CATEGORIES, DEFAULT_SERVICES, seedBarbershopDefaults(), SeedTx (+3 more)

### Community 158 - "@types/jsonwebtoken"
Cohesion: 0.24
Nodes (9): notifyQueueCapacity(), mocks, JoinQueueController, JoinQueueUseCase, inject, injectable, isQueueStaffForShop(), resolveQueueWhatsApp() (+1 more)

### Community 159 - "app.security.spec.ts"
Cohesion: 0.18
Nodes (7): ClienteWaitlistLegado, CreateOfferData, DelegateWaitlist, EntradaWaitlistLegada, ListEntriesFilters, OfertaWaitlistLegada, prismaWaitlistLegado

### Community 160 - "AdminDashboardController.ts"
Cohesion: 0.14
Nodes (13): AdminFinancialController, remainingFiado(), AGORA, byBarbershopAntigo(), casa(), consultas, db, equivalente() (+5 more)

### Community 161 - "IQueueRepository"
Cohesion: 0.16
Nodes (14): productTypeWhere(), enrichExpiration(), ProductListItem, ReservationDetail, ReservedEntry, ReservedMap, stripCost(), ExpirationStatus (+6 more)

### Community 162 - "issueAuthSession.ts"
Cohesion: 0.24
Nodes (12): formatPhoneBR(), logger, money(), notifyShopAboutReservation(), notifyShopEmail(), notifyShopWhatsApp(), ReservationNotifyInput, sanitizeCustomerName() (+4 more)

### Community 163 - "AsaasService.ts"
Cohesion: 0.25
Nodes (4): DeleteServiceController, DeleteServiceUseCase, inject, injectable

### Community 164 - "sendWhatsAppMessage"
Cohesion: 0.06
Nodes (34): ExpenseAmountAggregate, ExpenseCountAggregate, ExpenseTypeGroup, ExpenseWithCategory, FiadoTotalsRow, FiadoWithPayments, InventoryTotalsRow, PackageAggregate (+26 more)

### Community 165 - "assertAppointmentBookable.ts"
Cohesion: 0.30
Nodes (11): assertRedisAllowedInTests(), clients, createClient(), envInt(), getClient(), getQueueRedisConnection(), getSubscriberConnection(), purposeOptions() (+3 more)

### Community 166 - "ExportUserDataUseCase"
Cohesion: 0.13
Nodes (8): ReputationRepository, reputationSelect, RespondInput, reviewResponseSelect, reputationQuerySchema, respondToReviewSchema, ReputationUseCases, RespondInput

### Community 167 - "AdminNotificationController.ts"
Cohesion: 0.06
Nodes (28): CrmController, resolveCampaignClientIds(), resolveShop(), CrmCampaignListItem, CrmClientMetrics, CrmForecastDTO, CrmOverviewDTO, CrmSegment (+20 more)

### Community 168 - "AdminNotificationController"
Cohesion: 0.17
Nodes (16): AGORA, consultas, dashboardAntigo(), db, equivalente(), igual(), ler(), matchWhere() (+8 more)

### Community 169 - "google-auth-library"
Cohesion: 0.13
Nodes (8): CopilotRepository, suggestionSelect, acceptSchema, copilotSuggestionTypeMap, dismissSchema, listSuggestionsSchema, markReadSchema, ListQuery

### Community 171 - "JoinQueueController.ts"
Cohesion: 0.27
Nodes (8): recordTerminalNotificationFailure(), sanitizeNotificationError(), nextAttempt(), reconcilePendingRefunds(), CronLog, scheduleRefundReconciliation(), mockReconcile, mockWithCronLock

### Community 174 - "@opentelemetry/sdk-node"
Cohesion: 0.19
Nodes (7): createServiceSchema, updateServiceSchema, CreateServiceController, UpdateServiceController, inject, injectable, UpdateServiceUseCase

### Community 175 - "@opentelemetry/semantic-conventions"
Cohesion: 0.15
Nodes (10): ProfileController, injectable, DeleteAccountController, validateDeleteAccount(), DeleteAccountUseCase, injectable, ExportUserDataController, ExportUserDataUseCase (+2 more)

### Community 176 - "pino"
Cohesion: 0.29
Nodes (3): SocialUseCases, toComment(), toPublicPost()

### Community 177 - "@sentry/node"
Cohesion: 0.20
Nodes (7): IRegisterGoogleDTO, BASE_INPUT, mockFindFirst, mockTransaction, mockTxBarbershopCreate, mockTxUserCreate, mockVerifyIdToken

### Community 178 - "ListSubscriptionsController"
Cohesion: 0.14
Nodes (20): executeSlots, availabilityQuerySchema, CreateAppointmentInput, createAppointmentSchema, dateField, listAppointmentsQuerySchema, phoneBR, reservedProductSchema (+12 more)

### Community 179 - "queue.spec.ts"
Cohesion: 0.20
Nodes (3): FakeRedis, load(), state

### Community 181 - "ForgotPasswordUseCase"
Cohesion: 0.23
Nodes (14): backfillCrmLedger(), EventInput, recordAppointmentCompletion(), recordCrmFinancialEvent(), recordFiadoCreated(), recordFiadoPayment(), recordPackageSale(), recordQueueCompletion() (+6 more)

### Community 182 - "payments.routes.ts"
Cohesion: 0.20
Nodes (10): Fiado / despesas / comissões, Fila / agenda / híbrido, Notificações, Pacotes, Pagamentos, Produtos / estoque / retail, Regras de negócio — Backend, Reserva de produto (público → painel) (+2 more)

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
Cohesion: 0.05
Nodes (27): barbershopId(), IntegrationController, IntegrationRepository, asaasConfig, configSchemas, createIntegrationSchema, credentialSchemas, evolutionApiConfig (+19 more)

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
Nodes (36): getOwnerContactForBarbershop(), allowlist(), buildPaymentProviderSnapshot(), parsePayload(), SAFE_KEYS, RefundPaymentController, logger, RefundPaymentUseCase (+28 more)

### Community 203 - "index.ts"
Cohesion: 0.17
Nodes (11): ICommissionEntryDTO, ICommissionSplitDTO, ICommissionSummary, IListCommissionsQuery, CommissionRepository, CommissionWithRelations, dateFilter(), include (+3 more)

### Community 204 - "CancelSubscriptionController.ts"
Cohesion: 0.22
Nodes (8): assertRateLimit(), ContactController, hits, contactTopics, SubmitContactInput, submitContactSchema, SubmitContactMessageUseCase, injectable

### Community 205 - "check-docs.mjs"
Cohesion: 0.25
Nodes (5): entryFiles, errors, modulesDir, pkg, root

### Community 206 - "ProcessAsaasWebhookUseCase.ts"
Cohesion: 0.16
Nodes (8): ExpenseCategoryController, expenseCatRepo, ServiceCategoryController, serviceCatRepo, createExpenseCategorySchema, createServiceCategorySchema, updateExpenseCategorySchema, updateServiceCategorySchema

### Community 207 - "ExportFinancialDataUseCase.ts"
Cohesion: 0.33
Nodes (7): errorMessage(), INVALID_IDENTIFIER_CODES, isPrismaInvalidUuidError(), isUniqueConstraintError(), mapUniqueConstraintError(), UNIQUE_FIELD_MESSAGES, uniqueConstraintTarget()

### Community 208 - "resendWebhookService.ts"
Cohesion: 0.17
Nodes (10): IRegisterDTO, BASE_INPUT, mockCreate, mockFindFirst, mockFindUnique, mockTransaction, mockTxBarbershopCreate, mockTxScheduleCreateMany (+2 more)

### Community 210 - "AGENTS.md — AgendAI Backend"
Cohesion: 0.18
Nodes (11): 0. Regras essenciais, 1. O que é esta API, 2. Inventários locais, 3. Comandos frequentes, 5. Checklist de mudança, 6. Bugs conhecidos fora de escopo, AGENTS.md — Agenda Já Backend, ⚠️ Cuidado: Queries com comparação entre colunas (+3 more)

### Community 211 - "IPaymentRepository"
Cohesion: 0.33
Nodes (6): MetNoPeriod, MetNoPoint, MetNoWeatherProvider, parseMetNoForecast(), spDateKey(), symbolDetails()

### Community 212 - "Arquitetura backend — Clean Architecture e SOLID"
Cohesion: 0.33
Nodes (5): Arquitetura backend — Clean Architecture e SOLID, Fluxo de execução vs direção das dependências, Responsabilidades, SOLID (exemplos locais), Transações

### Community 213 - "queueDuplicate.ts"
Cohesion: 0.29
Nodes (4): issueProratedRefundMock, prismaMock, cancelReasonSchema, CancelSubscriptionController

### Community 214 - "Estrutura — Backend (`agendai-back-end`)"
Cohesion: 0.25
Nodes (7): CreateInput, entrySelect, publicEntrySelect, UpdateInput, imageAuthorizationMap, showcaseModeMap, showcaseStatusMap

### Community 216 - "CheckInAppointmentUseCase.ts"
Cohesion: 0.24
Nodes (11): assignServiceSchema, deleteScheduleSchema, removeServiceSchema, requestTimeOffSchema, timeOffQuerySchema, timeOffStatusEnum, upsertScheduleSchema, AssignServiceInput (+3 more)

### Community 218 - "onboarding.routes.ts"
Cohesion: 0.11
Nodes (21): LoginController, LoginUseCase, injectable, DEAD_JOB_QUEUES, getMonitoringDashboard(), hoursAgo(), minutesAgo(), readDeadJobs() (+13 more)

### Community 219 - "verifyRecaptcha.ts"
Cohesion: 0.15
Nodes (9): FEATURE_NAMES, MaturityLevel, RECOMMENDATIONS, TreeNode, TreeOptions, SeasonalDecomposition, correlation(), mean() (+1 more)

### Community 220 - "ResetPasswordUseCase"
Cohesion: 0.29
Nodes (7): categoryForTemplate(), createWorker(), ensureEmailWorker(), logDeliveryToPanel(), resetIdleTimer(), startEmailWorker(), stopEmailWorker()

### Community 221 - "notifications.routes.ts"
Cohesion: 0.29
Nodes (10): createShowcaseEntrySchema, showcaseEventQuerySchema, showcaseListQuerySchema, showcaseOrderSchema, updateShowcaseEntrySchema, CreateInput, EventQuery, ListQuery (+2 more)

### Community 223 - "seed.ts"
Cohesion: 0.14
Nodes (13): expenseAggregate, expenseFindMany, expenseGroupBy, fiadoCount, fiadoFindMany, makeRequest(), packageAggregate, queryRaw (+5 more)

### Community 225 - "postAiService.spec.ts"
Cohesion: 0.13
Nodes (20): ReferralsController, applyReferralCode(), ensureReferralCode(), generateCode(), getReferralDashboard(), logger, prismaMock, queueMock (+12 more)

### Community 228 - "ListSubscriptionsController"
Cohesion: 0.20
Nodes (9): A12 pricing + catalog, A13 purchasing ↔ InventoryEngine, A14 corporate, Contrato / WIP, Decisões novas (2026-09-26), Onda 3 (altos), P0 / dinheiro e takeover, Pendência conhecida (não corrigida nesta entrega) (+1 more)

### Community 230 - "emailWorker.ts"
Cohesion: 0.52
Nodes (5): attachBarbershopSchema, createOrganizationSchema, inviteMemberSchema, updateMemberRoleSchema, updateOrganizationSchema

### Community 231 - "ioredis"
Cohesion: 0.21
Nodes (8): ACTIVE_STATUSES, ALL_STATUSES, ListQueueController, resolveStatuses(), toPublicView(), ListQueueUseCase, inject, injectable

### Community 237 - "GetWeatherForecastUseCase.ts"
Cohesion: 0.16
Nodes (20): checkPostgres(), checkRedis(), constantTimeEquals(), DependencyCheck, errorMessage(), getMigrationsStatus(), healthRoutes(), isInternalHealthAuthorized() (+12 more)

### Community 241 - "@opentelemetry/instrumentation-fastify"
Cohesion: 0.33
Nodes (5): Estrutura — Backend (`agendai-back-end`), Middlewares, Módulos (`src/modules/`), Providers / integrações (arquivos), Rotas HTTP (`shared/infra/http/routes/`)

### Community 243 - "paymentProviderSnapshot.ts"
Cohesion: 0.11
Nodes (11): CashMovementFilters, CashMovementRepository, CashSummaryRow, CreateCashMovementData, findMany, queryRaw, DailyCloseoutData, DailyCloseoutRepository (+3 more)

### Community 244 - "GetCrmForecastUseCase"
Cohesion: 0.20
Nodes (9): addonSelect, comboSelect, CreateAddon, CreateCombo, CreateVariation, UpdateAddon, UpdateCombo, UpdateVariation (+1 more)

### Community 246 - "RecordActivationEventUseCase"
Cohesion: 0.09
Nodes (19): CompleteAppointmentController, completeAppointmentSchema, CompleteAppointmentRequest, CompleteAppointmentUseCase, ProcedureInput, inject, injectable, retailSalePayloadSchema (+11 more)

### Community 248 - "@fastify/cors"
Cohesion: 0.33
Nodes (4): GetServiceController, GetServiceUseCase, inject, injectable

### Community 249 - "PlansController"
Cohesion: 0.18
Nodes (5): prisma, { PrismaClient }, { randomUUID }, createPrisma(), AdvisoryLock

### Community 250 - "ListSubscriptionsController"
Cohesion: 0.50
Nodes (4): Auth, `GET /auth/me` 🔒, `POST /auth/login`, `POST /auth/refresh`

### Community 252 - "GoogleLoginUseCase"
Cohesion: 0.33
Nodes (4): EMPLOYEE, expectAppError(), mocks, OWNER

### Community 254 - "verifyRecaptcha.ts"
Cohesion: 0.22
Nodes (7): CheckInAppointmentController, checkInSchema, CheckInAppointmentUseCase, ICheckInDTO, ICheckInResult, logger, injectable

### Community 255 - "WhatsAppConnectionUseCase"
Cohesion: 0.15
Nodes (18): fallbackCache, FallbackEntry, getCachedAccess(), getRedis(), logger, markDegraded(), markHealthy(), PendingRead (+10 more)

### Community 256 - "subscribe.spec.ts"
Cohesion: 0.50
Nodes (4): COLORS, EmailTheme, escapeHtml(), safeUrl()

### Community 257 - "IntegrationRepository"
Cohesion: 0.40
Nodes (5): 11.1 Configuração, 11.2 Padrão de teste, 11.3 Executar testes, 11.4 O que deve ser testado, 11. Testes

### Community 258 - "14. Integrações Externas"
Cohesion: 0.35
Nodes (9): commentParamsSchema, commentQuerySchema, commentSchema, moderateTagSchema, salonParamsSchema, socialPostParamsSchema, taggedQuerySchema, tagParamsSchema (+1 more)

### Community 259 - "notifications.routes.ts"
Cohesion: 0.40
Nodes (4): base(), CATALOG_TEMPLATES, CatalogTemplate, STOCK_EXPENSE

### Community 260 - "paymentProviderSnapshot.ts"
Cohesion: 0.29
Nodes (3): CloudinaryStorageProvider, mocks, injectable

### Community 262 - "formRepository.ts"
Cohesion: 0.25
Nodes (7): AddFieldInput, CreateFormInput, formSelect, responseSelect, SubmitResponseInput, UpdateFieldInput, UpdateFormInput

### Community 263 - "productUseCases.ts"
Cohesion: 0.22
Nodes (8): EMPLOYEE, future(), list(), makeUseCase(), mocks, OWNER, QUERY, reservationRow()

### Community 265 - ".revokeAllSessions"
Cohesion: 0.24
Nodes (4): DeleteBarbershopController, DeleteBarbershopUseCase, inject, injectable

### Community 266 - "Sistema de Assinaturas"
Cohesion: 0.18
Nodes (12): computeProratedAmount(), findApprovedPayment(), getProratedRefundInfo(), issueProratedRefund(), logger, ProratedRefundResult, abacateMock, asaasMock (+4 more)

### Community 267 - "staffRepository.ts"
Cohesion: 0.29
Nodes (6): AssignServiceInput, RequestTimeOffInput, scheduleSelect, serviceSelect, timeOffSelect, UpsertScheduleInput

### Community 270 - "CancellationContextUseCase.ts"
Cohesion: 0.22
Nodes (8): Notas do inventário, Pontos-chave que sustentam a decisão, Riscos identificados, RLS — Inventário de policies e decisão por rota, Seção 1 — Decisão por rota (as 3 rotas sem `setRlsContext`), Seção 2 — Inventário completo de models (143), Seção 3 — Resumo e riscos, Seção 4 — Incidente de 2026-09-29 (migrations aplicadas no banco errado)

### Community 271 - "LoyaltyRepository"
Cohesion: 0.09
Nodes (28): AdminDashboardController, buildChartData(), buildSlotRanges(), countBySlot(), formatLabel(), generateTimeSlots(), getPeriodConfig(), Period (+20 more)

### Community 273 - "assertAppointmentBookable.ts"
Cohesion: 0.16
Nodes (14): createPublicAppointmentToken(), PublicAppointmentPayload, PublicPurpose, readPublicAppointmentToken(), appointmentInstant(), getAppointment(), logger, PublicAppointmentManagementUseCase (+6 more)

### Community 274 - "payments.routes.ts"
Cohesion: 0.27
Nodes (6): ListPaymentsController, abacateWebhookPreParsing(), ListRefundsController, checkoutRateLimit, paymentRoutes(), webhookRateLimit

### Community 276 - "calendar.routes.ts"
Cohesion: 0.43
Nodes (6): canGiveDiscount(), canOverrideProductPrice(), canSeeReservationCustomer(), isPrivilegedActor(), loadEmployeePermissions(), RESERVATION_PERMISSIONS

### Community 278 - "uploadImage.spec.ts"
Cohesion: 0.20
Nodes (3): CreateEntryData, UpdateEntryData, WaitlistUseCases

### Community 280 - "idempotency.spec.ts"
Cohesion: 0.31
Nodes (6): onboardingRoutes(), GetOnboardingUseCase, injectable, injectable, UpdateOnboardingStepUseCase, OnboardingProgressController

### Community 281 - "Passo a passo"
Cohesion: 0.29
Nodes (7): 1. Projeto GCP, 2. Variáveis no `.env`, 3. Criar Service Account + chave JSON, 4. Bucket, CORS, IAM público e pastas, 5. Rodar a API, 6. Smoke test, Passo a passo

### Community 283 - "CashMovementController"
Cohesion: 0.33
Nodes (5): CHAVES_PROIBIDAS, encontrarViolacoes(), RAIZ_SRC, REGEX_CHAVE_PROIBIDA, TOKENS_ATRIBUTO

### Community 284 - "categories.routes.ts"
Cohesion: 0.33
Nodes (6): Apêndice B — Endpoints por Role, MASTER_ADMIN only, OWNER + EMPLOYEE + MASTER_ADMIN, OWNER + MASTER_ADMIN, OWNER only, Público (sem autenticação)

### Community 288 - "14. Integrações Externas"
Cohesion: 0.40
Nodes (5): 14.0 E-mail (Resend) + Indicação, 14.1 Mercado Pago, 14.2 Google Cloud Storage, 14.3 Variáveis de Ambiente Obrigatórias em Produção, 14. Integrações Externas

### Community 289 - "Mapa de domínio — Backend"
Cohesion: 0.40
Nodes (4): Checkout de assinatura (implementado), Domínios → persistência (visão), Mapa de domínio — Backend, Testes

### Community 290 - "Admin — Entidades Bloqueadas"
Cohesion: 0.40
Nodes (5): Admin — Entidades Bloqueadas, `DELETE /admin/blocked-entities/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/blocked-entities/:id` 🔒 🛡️ `MASTER_ADMIN`, `GET /admin/blocked-entities` 🔒 🛡️ `MASTER_ADMIN`, `POST /admin/blocked-entities` 🔒 🛡️ `MASTER_ADMIN`

### Community 291 - "Graphify — Backend"
Cohesion: 0.50
Nodes (3): Comandos, Graphify — Backend, Procedimento obrigatório

### Community 292 - "Sistema de Assinaturas"
Cohesion: 0.50
Nodes (4): Fluxo de assinatura, Sistema de Assinaturas, Status de assinatura, Trial

### Community 295 - ".findIdentityById"
Cohesion: 0.33
Nodes (5): API social (prefixo `/api`), Banco e implantação, Conteúdo e mídia, Perfil público, Posts e perfil social do salão

### Community 296 - ".getPortalHistory"
Cohesion: 0.10
Nodes (17): logger, ResendVerificationEmailController, logger, ResendVerificationEmailUseCase, injectable, AsaasBillingType, AsaasCustomer, AsaasPayment (+9 more)

### Community 298 - "WorkSummaryController.ts"
Cohesion: 0.40
Nodes (5): logger, RECAPTCHA_MIN_SCORE, RecaptchaResponse, verifyRecaptcha(), verifyToken()

### Community 300 - "productsInventory.ts"
Cohesion: 0.16
Nodes (11): formats, rows, cache, files, loadPostStockImage(), POST_TEMPLATES, PostStockImageKey, PostTemplate (+3 more)

### Community 301 - "cleanOldLogs.cron.ts"
Cohesion: 0.18
Nodes (8): ClienteDaExtensao, DelegateDinamico, DelegatesTx, insideRlsTx, rlsExtension, BarbershopFinancialController, RequestContext, withShopContext()

### Community 302 - ".revokeAllSessions"
Cohesion: 0.50
Nodes (3): listQuerySchema, reviewInvitationService, reviewSchema

### Community 305 - "calendar.routes.ts"
Cohesion: 0.40
Nodes (4): blockSchema, id, policySchema, shopId()

### Community 309 - "notifications.routes.ts"
Cohesion: 0.40
Nodes (4): listSchema, ownerShop(), preferencesSchema, whatsappBodySchema

### Community 311 - "Inventário de scripts — Backend (`agendai-back-end`)"
Cohesion: 0.50
Nodes (3): Contrato com o frontend, Inventário de scripts — Backend (`agendai-back-end`), Observações críticas

## Knowledge Gaps
- **1370 isolated node(s):** `docker-entrypoint.sh script`, `args`, `base`, `token`, `shopId` (+1365 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **60 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `IUserResponseDTO` to `api.ts`, `IFiadoResponseDTO`, `IServiceResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `compilerOptions`, `IBarbershopRepository`, `AppError`, `💈 AgendAI — Backend API`, `IBarbershopResponseDTO`, `appointments.spec.ts`, `auth.routes.ts`, `MercadoPagoService`, `RegisterUseCase.ts`, `IPaymentResponseDTO`, `SubscribeUseCase.ts`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `emailWorker.ts`, `monitor-routes.js`, `scripts`, `planEconomics.ts`, `index.ts`, `appointmentUseCases.ts`, `ContactController.ts`, `CreateBarbershopUseCase`, `server.ts`, `QueueRepository`, `9. Como Criar um Novo Módulo`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `GetQueueMetricsUseCase`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `app.ts`, `ListBarbershopsUseCase.ts`, `ListQueueController.ts`, `13. Regras de Negócio Críticas`, `Fiado`, `CheckInAppointmentController.ts`, `PlansController.ts`, `6. Sistema de Autenticação e Autorização`, `8. Banco de Dados e Prisma`, `dependencies`, `Passo a passo`, `Pagamentos`, `Fila (Queue)`, `VerifyEmailController.ts`, `Admin — Entidades Bloqueadas`, `Admin — Usuários`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `Auth`, `Financeiro da Barbearia`, `@fastify/multipart`, `ProcessAbacateWebhookController.ts`, `tsup`, `@types/node`, `authSchemas.ts`, `disposable-email-domains.d.ts`, `vitest.config.mts`, `sendWhatsAppMessage`, `Pentest local — inputs, upload, XSS e exposição pública`, `UpdateBarbershopUseCase`, `QueueRepository`, `IQueueRepository`, `sendWhatsAppMessage`, `ExportUserDataUseCase`, `AdminNotificationController.ts`, `AdminNotificationController`, `google-auth-library`, `ListSubscriptionsController`, `GetPaymentStatusUseCase`, `ForgotPasswordUseCase`, `payments.routes.ts`, `AdminBarbershopController`, `bruteForceProtection.spec.ts`, `@fastify/rate-limit`, `pg`, `Runbook: Aplicar migrations do backend em Staging/Produção`, `assertOperationEnabled.ts`, `index.ts`, `CancelSubscriptionController.ts`, `ProcessAsaasWebhookUseCase.ts`, `ExportFinancialDataUseCase.ts`, `queueDuplicate.ts`, `Estrutura — Backend (`agendai-back-end`)`, `CheckInAppointmentUseCase.ts`, `onboarding.routes.ts`, `notifications.routes.ts`, `postAiService.spec.ts`, `GetWeatherForecastUseCase.ts`, `paymentProviderSnapshot.ts`, `GetCrmForecastUseCase`, `RecordActivationEventUseCase`, `@fastify/cors`, `GoogleLoginUseCase`, `verifyRecaptcha.ts`, `formRepository.ts`, `Sistema de Assinaturas`, `staffRepository.ts`, `assertAppointmentBookable.ts`, `payments.routes.ts`, `calendar.routes.ts`, `.getPortalHistory`, `WorkSummaryController.ts`, `.revokeAllSessions`, `calendar.routes.ts`, `productReservationRoutes.ts`, `notifications.routes.ts`?**
  _High betweenness centrality (0.202) - this node is a cross-community bridge._
- **Why does `prisma` connect `IUserResponseDTO` to `api.ts`, `IFiadoResponseDTO`, `PostsController.ts`, `IExpenseResponseDTO`, `AbacatePayService`, `index.ts`, `compilerOptions`, `AppError`, `IBarbershopResponseDTO`, `normalizeCpf`, `IStorageProvider`, `appointments.spec.ts`, `IPlanResponseDTO`, `MercadoPagoService`, `RegisterUseCase.ts`, `SubscribeUseCase.ts`, `AgendAI Back‑end — Manual do Sistema`, `blockedEntityService.ts`, `AppointmentController.ts`, `IQueueRepository`, `BarbershopFinancialController.ts`, `queue.spec.ts`, `emailWorker.ts`, `IPaymentRepository`, `monitor-routes.js`, `planEconomics.ts`, `appointmentUseCases.ts`, `index.ts`, `.findById`, `ContactController.ts`, `CreateBarbershopUseCase`, `server.ts`, `QueueRepository`, `9. Como Criar um Novo Módulo`, `Barbearias`, `12. Erros Comuns e Como Evitá-los`, `AdminDashboardController.ts`, `🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI`, `app.ts`, `ListQueueController.ts`, `13. Regras de Negócio Críticas`, `6. Sistema de Autenticação e Autorização`, `Passo a passo`, `Pagamentos`, `7. Sistema de Assinaturas e Bloqueio de CPF`, `VerifyEmailController.ts`, `CrmController`, `Admin — Usuários`, `postgres.ts`, `Admin — Planos`, `Assinaturas`, `Financeiro da Barbearia`, `@fastify/multipart`, `zod`, `@types/node`, `authSchemas.ts`, `disposable-email-domains.d.ts`, `vitest.config.mts`, `sendWhatsAppMessage`, `@types/jsonwebtoken`, `app.security.spec.ts`, `AdminDashboardController.ts`, `IQueueRepository`, `issueAuthSession.ts`, `sendWhatsAppMessage`, `ExportUserDataUseCase`, `AdminNotificationController.ts`, `AdminNotificationController`, `google-auth-library`, `JoinQueueController.ts`, `GetPaymentStatusUseCase`, `ForgotPasswordUseCase`, `payments.routes.ts`, `ResetPasswordUseCase`, `Runbook: Aplicar migrations do backend em Staging/Produção`, `assertOperationEnabled.ts`, `index.ts`, `queueDuplicate.ts`, `Estrutura — Backend (`agendai-back-end`)`, `onboarding.routes.ts`, `postAiService.spec.ts`, `GetWeatherForecastUseCase.ts`, `paymentProviderSnapshot.ts`, `GetCrmForecastUseCase`, `RecordActivationEventUseCase`, `verifyRecaptcha.ts`, `formRepository.ts`, `.revokeAllSessions`, `Sistema de Assinaturas`, `staffRepository.ts`, `LoyaltyRepository`, `assertAppointmentBookable.ts`, `calendar.routes.ts`, `idempotency.spec.ts`, `.getPortalHistory`, `.revokeAllSessions`, `calendar.routes.ts`, `notifications.routes.ts`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `IBarbershopRepository` connect `SubscribeUseCase.ts` to `api.ts`, `13. Regras de Negócio Críticas`, `sendWhatsAppMessage`, `scripts`, `CheckInAppointmentController.ts`, `IBarbershopRepository`, `.revokeAllSessions`, `index.ts`, `vitest.config.mts`, `appointments.spec.ts`, `RegisterUseCase.ts`, `ForgotPasswordUseCase`, `notifications.routes.ts`, `Barbearias`, `GetQueueMetricsUseCase`, `@types/jsonwebtoken`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `AppError` (e.g. with `expectAppError()` and `expectAppError()`) actually correct?**
  _`AppError` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 59 inferred relationships involving `authenticate()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`authenticate()` has 59 INFERRED edges - model-reasoned connections that need verification._
- **Are the 58 inferred relationships involving `setRlsContext()` (e.g. with `activationRoutes()` and `analyticsRoutes()`) actually correct?**
  _`setRlsContext()` has 58 INFERRED edges - model-reasoned connections that need verification._
- **What connects `docker-entrypoint.sh script`, `args`, `base` to the rest of the system?**
  _1370 weakly-connected nodes found - possible documentation gaps or missing edges._