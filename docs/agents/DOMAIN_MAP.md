# Mapa de domínio — Backend

Fluxo HTTP:

`Route + preHandler → Controller → UseCase → IRepository/IProvider → implementação → DB/externo`

Persistência: Prisma 6.4 + PostgreSQL (`@prisma/adapter-pg`). RLS via `setRlsContext` quando aplicável.

## Domínios → persistência (visão)

| Domínio | Rotas | Persistência principal |
|---|---|---|
| Auth / users | `/auth`, `/users` | `User`, `RefreshToken`, `UserSession` (sessões/"meus dispositivos": `GET|POST /auth/sessions*`, revogação + flags no Redis, cron `sessionsCleanup`) |
| Barbershop / schedule / logo | `/barbershops` (logo via Cloudinary: signed URL + multipart; tema/capa da página pública: `GET|PUT /barbershops/:id/page-theme` com `mode` + variantes `darkColors`/`lightColors`, `POST|DELETE .../page-theme/cover`; cartão OG: `GET .../page-theme/og-image` PNG 1200×630; redes sociais do dono no perfil: `PATCH|PUT /barbershops/:id` com `socialLinks` mapa rede → URL, exposto no `GET` público ordenado) | `Barbershop`, `Schedule`, `BarbershopPageTheme` |
| Serviços / categorias | `/services`, `/service-categories` | `Service`, `ServiceCategory` |
| Fila | `/queue` | `QueueItem` |
| Agenda | `/appointments` | `Appointment` (campo `source`: `APP`, `PUBLIC` ou `WHATSAPP_OWNER_BOT`) |
| Clientes / CRM | `/clients`, `/crm` | `SalonClient` + agregações CRM |
| Casos do cliente (advocacia) | `/clients/:id/cases` | `ClientCase` (apelido, área de atuação, nº do processo, situação, prioridade, tribunal, valores, responsável) — restrito à equipe |
| Gestão de processos (escritório) | `/cases` (pipeline, relatórios por área), `/cases/deadlines`, `/cases/holidays`, `/cases/:caseId/{overview,tasks,deadlines,events,documents}` | `ClientCase` + `CaseTask`, `CaseDeadline`, `CaseEvent`, `CaseDocument`, `OfficeHoliday` — interno do escritório, exige feature `caseManagement` do segmento |
| Contratos e assinaturas (escritório) | `/cases/contracts`, `/cases/:caseId/contracts`, `/cases/contracts/:id/{signers,send}`, `/contracts/sign/:token` (público) | `CaseContract`, `ContractSignature` — link público por token; a página de assinatura só expõe título, conteúdo e nome do signatário |
| Timesheet do processo (escritório) | `/cases/time-entries`, `/cases/:caseId/time-entries`, `/cases/:caseId/time-entries/summary` | `CaseTimeEntry` — valor derivado (minutos/60 × valor/hora) |
| Honorários de êxito (escritório) | `/cases/success-fees`, `/cases/:caseId/success-fees` | `CaseSuccessFee` — percentual sobre `awardedAmount`, valor recalculado |
| Digestão de intimações / PJe (escritório) | `/cases/intimations`, `/cases/intimations/import`, `/cases/intimations/:id` (triagem) | `CourtIntimation` — detecta número CNJ e sugere tipo de andamento |
| NFS-e do escritório | `/cases/fee-invoices`, `/cases/fee-invoices/:id/issue` | `CaseFeeInvoice` — manual ou via provedor (NFE.io / Focus NFe, exigem credenciais) |
| Alertas de prazo (escritório) | `/cases/alerts` (consulta; geração no cron diário) | `DeadlineAlert` — deduplicado por (prazo, destinatário, tipo, canal, dia) |
| Transferência entre unidades (escritório) | `/cases/transfers`, `/cases/:caseId/transfers`, `/cases/transfers/:id/respond`, `/cases/transfers/sibling-shops` | `CaseTransfer` — só entre unidades da mesma organização; move o caso e vinculados em transação |
| Casos no portal do cliente | `/client/portal/cases` (sessão do portal) | `ClientCase.shareWithClient` + `CaseEvent.visibleToClient` — sem número de processo, apelido, tribunal ou observações |
| Segmentos / gate | `/services` (público com `authenticateOptional` → `publicBookable` + `includeInternal`) | `Service.publicBookable`; config por segmento em `src/shared/segments/` (gate, publicidade, paridade `segmentParity.json`) |
| Pacotes | `/service-packages`, `/client-packages` | `ServicePackage`, `ClientPackage` |
| Produtos / estoque / retail | `/products` (CRUD, incl. `DELETE /products/:id`), inventory, sales | `Product`, movimentos, `RetailSale*` |
| Reservas de produto (vitrine pública) | `/barbershops/:id/public-products/*` (público) + `/product-reservations` (painel) + aviso ao salão em `productReservations/reservationNotify.ts` (WhatsApp + e-mail `product_reservation_alert`) | `ProductReservation` |
| Fiado / despesas | `/fiado`, `/expenses` | `Fiado`, `FiadoPayment`, `Expense*` |
| Comissões | `/commissions` | modelos de comissão |
| Assinaturas / planos / pagamentos | `/subscriptions`, `/plans`, `/payments`, webhooks | `Subscription`, `Plan`, `Invoice`, `Payment`, `BlockedEntity` |
| Feed / posts / perfil social | `/feed`, `/posts`, `/salons/:salonId/posts/:postId`, `/salons/:salonId/stories`, `/salons/:salonId/tagged`; rotas legadas `POST /posts/:id/schedule`, `POST /posts/:id/cancel-schedule`, `GET /posts/scheduled` mantidas por compat (sem consumidores no front) | `FeedPost`, `PostMedia`, `PostComment`, `PostTag`; comentários por JWT staff ou sessão OTP do cliente, marcações aprovadas pelo owner |
| Admin | `/admin/*` | agregações + audit/notifications |
| Notificações | `/notifications` + filas | deliveries / Evolution |
| NPS | `/admin/nps/*` (master) + `/nps/:surveyId` (público, com rate limit) | `NpsSurvey`, `NpsResponse`; gating via `NotificationPreference` (`NPS_SURVEY`) e `NotificationSuppression` |
| Referrals | `/referrals` | `ReferralCode`, `Referral` |
| Contact | `/contact` | formulário / notificação |
| Assistente no WhatsApp (dono) | `/barbershops/:id/owner-bot/*` (painel: `link-code`, `status`, `link`, `preferences` GET/PUT — Zod `ownerBotPreferencesUpdateSchema` com horário `HH:MM` e `alertTypes` do enum, `catalog` — `buildOwnerBotSegmentCatalog` por `businessSegment`, `action-logs` — filtros `limit≤100`/`from`/`to`/`commandId`/`riskClass`/`status`) + `POST /webhooks/evolution/platform` (entrada da Evolution, segredo `EVOLUTION_WEBHOOK_SECRET`) | `OwnerBotLinkCode`, `OwnerBotLink`, `OwnerBotActionLog`, `OwnerBotPreference`; fila BullMQ `owner-bot` |
| Importação de planilhas | `/barbershops/:id/imports*` (upload, alvo, mapeamento, validate/dry-run, confirm, preview, errors.csv, template, undo, cancel) — dono-only com `setRlsContext` | `ImportBatch`, `ImportRowResult`, `ImportCreatedEntity`; escreve em `SalonClient`, `Service`, `Appointment` (via `source: "IMPORT"`); fila BullMQ `data-import`. Detalhes em `docs/IMPORTACAO_PLANILHAS.md` |

## Checkout de assinatura (implementado)

`SubscribeUseCase` + `config/paymentProviders.ts`:

| Método | Provider | Papel |
|---|---|---|
| `asaas` | Asaas | **Padrão em produção**. PIX embutido (QR). Cartão na própria página (checkout transparente): o PAN segue só até a Asaas e não é gravado. |
| `payment_link` | AbacatePay | Implementado; em prod só se habilitado via env |
| `pix` / cartão | Mercado Pago | Implementado; em prod só se habilitado via env |

Em não-produção, o fallback habilita os três. Override: `PAYMENT_PROVIDERS_ENABLED` (lista separada por vírgula).

Cartão Asaas: o formulário fica no checkout do app. O body `asaasCreditCard` é repassado à Asaas e não entra em log, idempotência nem `rawResponse`. O trial guarda só o token criptografado para o cron pós-trial.

## Testes

Há dezenas de `*.spec.ts` (unit) + pastas `tests/integration` e `tests/pentest`. Cobertura de comportamento ≠ garantia de produção.
