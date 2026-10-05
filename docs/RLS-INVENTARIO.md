# RLS — Inventário de policies e decisão por rota

- **Data:** 2026-09-29
- **Escopo:** `agendai-back-end` (Prisma + Postgres/Supabase)
- **Método:** leitura estática de `prisma/schema.prisma` (143 models) cruzada com grep em `prisma/migrations/**/migration.sql` por `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY`. **Nenhuma consulta ao banco de dados foi feita para este documento.**
- **Arquivo de contexto:** `src/libs/prismaExtensions.ts` (extensão que grava o GUC `app.current_barbershop_id`), `src/shared/infra/http/middlewares/setRlsContext.ts`, `src/shared/infra/http/middlewares/authenticateClient.ts`.

---

## Seção 1 — Decisão por rota (as 3 rotas sem `setRlsContext`)

| rota | tabelas tocadas (file:line) | tem policy? (migration:linha) | classificação | decisão | justificativa |
|---|---|---|---|---|---|
| `wallet.routes.ts` — 5 rotas `/client/portal/wallet*` com `preHandler: [authenticateClient]` (`src/modules/wallet/wallet.routes.ts:10,16,22,28,34`) | `digital_wallets` (`src/modules/wallet/walletRepository.ts:81,90,112,115,128,134`); `wallet_entries` (`src/modules/wallet/walletRepository.ts:96,140`) | **não** para as duas (`—`) | tenant (porém o escopo real é `identityId`, não `barbershopId`) | **não adicionar** `setRlsContext` | O middleware só lê `request.user?.barbershopId` (`setRlsContext.ts:10`) e `authenticateClient` monta `request.user` sem esse campo (`authenticateClient.ts:61-66`): a chamada cairia no ramo `else` e seguira sem contexto (`setRlsContext.ts:16-18`) — seria um no-op silencioso. Além disso as policies existentes casam por coluna `barbershopId`, que `digital_wallets`/`wallet_entries` não têm; a proteção correta aqui é escopo por `identityId` + policy própria, não o middleware. Ver risco de `transfer` na Seção 3. |
| `contact.routes.ts` — `POST /contact` (público, rate-limit em `src/shared/infra/http/routes/contact.routes.ts:8-20`) | `admin_notifications` (`src/modules/contact/useCases/SubmitContactMessageUseCase.ts:29`); `notification_deliveries` (`src/modules/notifications/services/notificationDeliveryService.ts:151,163`, acionado por `enqueueWhatsApp` em `SubmitContactMessageUseCase.ts:49`) | `admin_notifications`: **não** (`—`); `notification_deliveries`: **sim** (`20260902010000_add_notification_outbox_and_safe_provider_snapshots:179`) | admin (`admin_notifications`) / tenant (`notification_deliveries`) | **não adicionar** `setRlsContext` | A rota é pública (sem `request.user`, logo `setRlsContext` seria no-op). A policy de `notification_deliveries` aceita GUC vazio — `COALESCE(current_setting('app.current_barbershop_id', true), '') = ''` (`...20260902010000.../migration.sql:181`) — e a extensão grava `''` quando não há contexto (`prismaExtensions.ts:34,39-41`), então a escrita funciona sem o middleware. `admin_notifications` não tem RLS, portanto o middleware não protegeria nada; adicioná-lo criaria falso senso de segurança. |
| `emailGallery.routes.ts` — `GET /dev/email-templates` e `GET /dev/email-templates/:template` (`src/shared/infra/http/routes/emailGallery.routes.ts:155,186`) | nenhuma (HTML estático montado em memória) | — (não aplica) | — | **não adicionar** `setRlsContext` | Não há acesso a banco; dev-only com retorno 404 em produção (`emailGallery.routes.ts:156-158,187-189`). |

### Pontos-chave que sustentam a decisão

1. **`setRlsContext.ts:12-18` não lança erro.** Se `request.user?.barbershopId` estiver ausente, a função apenas chama `done()` — o request segue normalmente, sem contexto RLS e sem qualquer log/erro. Falha aqui é silenciosa por projeto.
2. **`authenticateClient.ts:61-66` não popula `barbershopId`.** O objeto gravado em `request.user` contém apenas `id`, `role: "CLIENT"`, `identityId` e `sessionId`. Portanto, mesmo que `setRlsContext` fosse anexado às rotas do portal, ele nunca criaria contexto.
3. **O portal do cliente inteiro já roda sem o middleware** (`clientPortal.routes.ts:59-108`): todas as rotas autenticadas usam somente `authenticateClient` (`my-links`, `my-care-instructions`, `request-link`, `me`, `dashboard`, `history`, `revoke`, `logout`, `logout-all`). Não é um caso isolado de uma rota — é o padrão de todo o portal.
4. **Consequência:** nessas rotas o GUC `app.current_barbershop_id` fica `''` (`prismaExtensions.ts:34,40`) e toda policy com cláusula `= ''` libera a leitura/escrita. A contenção depende exclusivamente dos `where` aplicativos (escopo por `identityId`, `sessionId` etc.).
5. **Não há hook global:** `src/shared/infra/http/routes/api.ts` não registra `setRlsContext` como `preHandler`/`onRequest` — o middleware só existe onde é declarado rota a rota.

---

## Seção 2 — Inventário completo de models (143)

**Critérios de classificação**

- **tenant** — dado pertence a um salão, ao seu staff ou aos seus clientes: coluna `barbershopId` direta, ou FK em cadeia para tabela de tenant (ex.: `invoices`→`subscriptions`, `fiado_payments`→`fiados`, `service_variations`→`services`, `form_fields`→`custom_forms`, `voucher_usages`→`vouchers`, `review_responses`→`client_reviews`, `feedbacks`→`users`, `digital_wallets`→`client_identities`). Inclui `barbershops` (a própria entidade tenant).
- **público** — catálogo/preço de plataforma, lido sem sessão de tenant: `plans`, `corporate_plans`.
- **admin** — operação interna da plataforma (staff interno): `admin_notifications`, `audit_logs`, `access_logs`, `error_logs`, `internal_invitations`, `tickets`/`tasks` (coluna de comentário/histórico).
- **sistema** — auth/infra/rotina automática: tokens, sessões e OTP do portal, `cron_runs`, `idempotency_records`, `email_deliveries`, pipeline de notificação (`notification_outbox/attempts/provider_events`).

**Evidência:** `migration-diretório:linha` do `CREATE POLICY` que vigia (ou, para as 12 tabelas do loop, a linha do array no `20260903010000_products_inventory_retail`, cujo policy é criado pelo `FOREACH` em `migration.sql:262-273`). `—` = nenhuma `CREATE POLICY` encontrada nas migrations.

| tabela | tem policy? | classificação | evidência (migration:linha) |
|---|---|---|---|
| `users` | sim | tenant | 20260827190000_fix_rls_unset_guc:130 |
| `account_deletion_requests` | não | tenant | — |
| `refresh_tokens` | não | sistema | — |
| `verification_tokens` | não | sistema | — |
| `payments` | sim | tenant | 20260827190000_fix_rls_unset_guc:26 |
| `barbershops` | não | tenant | — |
| `barbershop_onboardings` | não | tenant | — |
| `schedules` | sim | tenant | 20260827190000_fix_rls_unset_guc:54 |
| `appointment_policies` | não | tenant | — |
| `calendar_blocks` | sim | tenant | 20260902220000_shop_manual_status:24 |
| `appointment_series` | não | tenant | — |
| `services` | sim | tenant | 20260827190000_fix_rls_unset_guc:47 |
| `queue` | sim | tenant | 20260827190000_fix_rls_unset_guc:12 |
| `commission_entries` | não | tenant | — |
| `appointments` | sim | tenant | 20260827190000_fix_rls_unset_guc:19 |
| `salon_clients` | sim | tenant | 20260827190000_fix_rls_unset_guc:40 |
| `client_procedure_records` | sim | tenant | 20260912000003_add_client_procedure_records:39 |
| `service_packages` | sim | tenant | 20260827190000_fix_rls_unset_guc:82 |
| `client_packages` | sim | tenant | 20260827190000_fix_rls_unset_guc:89 |
| `feed_posts` | sim | tenant | 20260827190000_fix_rls_unset_guc:61 |
| `post_media` | não | tenant | — |
| `plans` | não | público | — |
| `subscriptions` | sim | tenant | 20260827190000_fix_rls_unset_guc:33 |
| `invoices` | não | tenant | — |
| `blocked_entities` | sim | tenant | 20260827190000_fix_rls_unset_guc:138 |
| `refunds` | sim | tenant | 20260827190000_fix_rls_unset_guc:96 |
| `admin_notifications` | não | admin | — |
| `audit_logs` | não | admin | — |
| `access_logs` | não | admin | — |
| `error_logs` | não | admin | — |
| `service_categories` | sim | tenant | 20260827190000_fix_rls_unset_guc:114 |
| `expense_categories` | sim | tenant | 20260827190000_fix_rls_unset_guc:122 |
| `expenses` | sim | tenant | 20260827190000_fix_rls_unset_guc:75 |
| `fiados` | sim | tenant | 20260827190000_fix_rls_unset_guc:68 |
| `fiado_adjustments` | sim | tenant | 20260903010000_products_inventory_retail:265 |
| `fiado_payments` | não | tenant | — |
| `financial_correction_logs` | não | tenant | — |
| `crm_financial_events` | sim | tenant | 20260901000000_add_crm_financial_intelligence:109 |
| `crm_backfill_runs` | sim | tenant | 20260901190000_mvp_public_readiness:26 |
| `crm_campaigns` | sim | tenant | 20260901000000_add_crm_financial_intelligence:110 |
| `crm_campaign_recipients` | sim | tenant | 20260901000000_add_crm_financial_intelligence:111 |
| `referral_codes` | sim | tenant | 20260827190000_fix_rls_unset_guc:103 |
| `referrals` | sim | tenant | 20260827190000_fix_rls_unset_guc:150 |
| `email_deliveries` | não | sistema | — |
| `salon_email_preferences` | sim | tenant | 20260920000000_email_preferences:110 |
| `barbershop_email_settings` | sim | tenant | 20260920000000_email_preferences:113 |
| `email_delivery_logs` | sim | tenant | 20260920000000_email_preferences:116 |
| `notification_deliveries` | sim | tenant | 20260902010000_add_notification_outbox_and_safe_provider_snapshots:179 |
| `notification_outbox` | sim | sistema | 20260902010000_add_notification_outbox_and_safe_provider_snapshots:204 |
| `notification_attempts` | sim | sistema | 20260902010000_add_notification_outbox_and_safe_provider_snapshots:215 |
| `notification_provider_events` | sim | sistema | 20260902010000_add_notification_outbox_and_safe_provider_snapshots:226 |
| `notification_preferences` | sim | tenant | 20260902010000_add_notification_outbox_and_safe_provider_snapshots:187 |
| `notification_suppressions` | sim | tenant | 20260902010000_add_notification_outbox_and_safe_provider_snapshots:195 |
| `feedbacks` | não | tenant | — |
| `client_reviews` | não | tenant | — |
| `password_reset_tokens` | não | sistema | — |
| `daily_weather_logs` | não | tenant | — |
| `cron_runs` | não | sistema | — |
| `idempotency_records` | não | sistema | — |
| `product_categories` | sim | tenant | 20260903010000_products_inventory_retail:263 |
| `suppliers` | sim | tenant | 20260903010000_products_inventory_retail:263 |
| `products` | sim | tenant | 20260903010000_products_inventory_retail:263 |
| `stock_movements` | sim | tenant | 20260903010000_products_inventory_retail:263 |
| `inventory_receipts` | sim | tenant | 20260903010000_products_inventory_retail:263 |
| `inventory_receipt_items` | sim | tenant | 20260903010000_products_inventory_retail:264 |
| `retail_sales` | sim | tenant | 20260903010000_products_inventory_retail:264 |
| `retail_sale_lines` | sim | tenant | 20260903010000_products_inventory_retail:264 |
| `retail_sale_refunds` | sim | tenant | 20260903010000_products_inventory_retail:264 |
| `retail_sale_refund_lines` | sim | tenant | 20260903010000_products_inventory_retail:265 |
| `catalog_template_installs` | sim | tenant | 20260903010000_products_inventory_retail:265 |
| `daily_closeouts` | não | tenant | — |
| `activation_metrics` | não | tenant | — |
| `cash_movements` | sim | tenant | 20260909040000_add_rls_v11_v12:19 |
| `loyalty_programs` | sim | tenant | 20260909040000_add_rls_v11_v12:23 |
| `loyalty_accounts` | sim | tenant | 20260909040000_add_rls_v11_v12:27 |
| `loyalty_ledger_entries` | sim | tenant | 20260909040000_add_rls_v11_v12:31 |
| `professional_goals` | sim | tenant | 20260909040000_add_rls_v11_v12:35 |
| `appointment_deposits` | sim | tenant | 20260910000005_add_rls_v13:11 |
| `appointment_waitlist_entries` | sim | tenant | 20260910000005_add_rls_v13:13 |
| `appointment_waitlist_offers` | sim | tenant | 20260910000005_add_rls_v13:15 |
| `salon_recurring_package_plans` | sim | tenant | 20260922000000_rename_membership_to_recurring_packages:125 |
| `recurring_package_benefits` | sim | tenant | 20260922000000_rename_membership_to_recurring_packages:128 |
| `client_recurring_packages` | sim | tenant | 20260922000000_rename_membership_to_recurring_packages:131 |
| `recurring_package_cycles` | sim | tenant | 20260922000000_rename_membership_to_recurring_packages:134 |
| `recurring_package_usages` | sim | tenant | 20260922000000_rename_membership_to_recurring_packages:137 |
| `showcase_entries` | não | tenant | — |
| `showcase_events` | não | tenant | — |
| `service_variations` | não | tenant | — |
| `service_addons` | não | tenant | — |
| `service_combos` | não | tenant | — |
| `combo_items` | não | tenant | — |
| `visits` | não | tenant | — |
| `visit_tabs` | não | tenant | — |
| `tab_items` | não | tenant | — |
| `tab_payments` | não | tenant | — |
| `client_identities` | não | sistema | — |
| `client_sessions` | não | sistema | — |
| `client_otp_challenges` | não | sistema | — |
| `client_salon_links` | não | tenant | — |
| `care_instruction_templates` | não | tenant | — |
| `client_care_instructions` | não | tenant | — |
| `profit_entries` | não | tenant | — |
| `profit_settings` | não | tenant | — |
| `equipment` | não | tenant | — |
| `equipment_movements` | não | tenant | — |
| `equipment_needs` | não | tenant | — |
| `organizations` | não | tenant | — |
| `organization_members` | não | tenant | — |
| `custom_forms` | não | tenant | — |
| `form_fields` | não | tenant | — |
| `form_responses` | não | tenant | — |
| `staff_schedules` | não | tenant | — |
| `staff_services` | não | tenant | — |
| `staff_time_off` | não | tenant | — |
| `pricing_rules` | não | tenant | — |
| `vouchers` | não | tenant | — |
| `voucher_usages` | não | tenant | — |
| `salon_reputation` | não | tenant | — |
| `review_responses` | não | tenant | — |
| `digital_wallets` | não | tenant | — |
| `wallet_entries` | não | tenant | — |
| `quality_protocols` | não | tenant | — |
| `quality_audits` | não | tenant | — |
| `purchase_orders` | não | tenant | — |
| `purchase_order_items` | não | tenant | — |
| `copilot_suggestions` | não | tenant | — |
| `corporate_plans` | não | público | — |
| `corporate_subscriptions` | não | tenant | — |
| `ai_conversations` | não | tenant | — |
| `ai_messages` | não | tenant | — |
| `ai_intent_logs` | não | tenant | — |
| `fiscal_configs` | não | tenant | — |
| `nfe_records` | não | tenant | — |
| `integrations` | não | tenant | — |
| `integration_sync_logs` | não | tenant | — |
| `dismissed_recommendations` | não | tenant | — |
| `internal_invitations` | não | admin | — |
| `tickets` | não | tenant | — |
| `ticket_comments` | não | admin | — |
| `ticket_history` | não | admin | — |
| `tasks` | não | tenant | — |
| `task_comments` | não | admin | — |
| `task_history` | não | admin | — |

### Notas do inventário

- **`schedule_exceptions` tem policy mas não tem model no schema** (`20260902220000_shop_manual_status:16`): existe no banco com RLS, mas o Prisma não a gerencia — fica fora das 143 linhas acima.
- **Tabelas de memberships renomeadas:** `salon_membership_plans`, `membership_benefits`, `client_memberships`, `membership_cycles` e `membership_usages` receberam policy em `20260910000005_add_rls_v13` e foram substituídas por `*_recurring_packages*` em `20260922000000_rename_membership_to_recurring_packages` (policy recriada nas linhas 125-137). Não há mais models para elas.
- **12 policies criadas por loop** em `20260903010000_products_inventory_retail:262-273` (`FOREACH ... ARRAY[...]` com `format(...)`), por isso a evidência aponta a linha do array.
- **`referrals`** não tem coluna `barbershopId`, mas sim `referrerBarbershopId`/`refereeBarbershopId` — é tenant mesmo assim.

---

## Seção 3 — Resumo e riscos

| métrica | valor |
|---|---|
| models no `schema.prisma` | 143 |
| com policy (`CREATE POLICY` nas migrations) | **59** |
| sem policy | **84** |
| das sem policy, classificadas **tenant** | **64** |
| classificação total | tenant 120 / sistema 12 / admin 9 / público 2 |

### Riscos identificados

1. **Portal do cliente com GUC vazio, dependendo só do `where`.** Toda a rota autenticada do portal (`clientPortal.routes.ts:59-108`, `wallet.routes.ts:8-36`) usa apenas `authenticateClient`, que não popula `barbershopId` (`authenticateClient.ts:61-66`); `setRlsContext` não é anexado e, anexado, seria no-op (`setRlsContext.ts:12-18`). A extensão então grava `''` (`prismaExtensions.ts:34,40`) e qualquer policy com `= ''` libera tudo. Como a maioria das tabelas do portal (`client_salon_links`, `client_care_instructions`, `visits`, `visit_tabs`, `tab_items`, `tab_payments`, `digital_wallets`, `wallet_entries`) **nem tem policy**, a única contenção é o `where` por `identityId`/`sessionId` em cada use case — um único filtro esquecido vaza dado de outro cliente.
2. **`wallet.transfer` aceitando `targetWalletId` arbitrário** (`walletRepository.ts:115`): a validação verifica apenas existência da carteira de destino e desigualdade com a origem (`walletRepository.ts:115-120`), sem checar relação com a identidade autenticada. Somado à ausência total de policy em `digital_wallets`/`wallet_entries`, um cliente logado pode transferir saldo para a carteira de outra identidade conhecendo o UUID.
3. **Rotas públicas** (`POST /contact` e demais endpoints sem sessão): gravam com GUC `''`; a única mitigação é a policy (quando existe) e o rate limit aplicativo (`contact.routes.ts:11-17`). `admin_notifications` — destino do formulário de contato — não tem policy nenhuma.
4. **`schedule_exceptions` com policy mas sem model no schema** (`20260902220000_shop_manual_status:14-16`): drift entre banco e `schema.prisma` — a tabela existe com RLS, o Prisma não a declara, não há model/query tipada e nenhuma migração futura a acompanha automaticamente.
5. **Observação:** 9 tabelas classificadas como **admin** e 2 como **público** também estão sem policy (`admin_notifications`, `audit_logs`, `access_logs`, `error_logs`, `internal_invitations`, `ticket_comments`, `ticket_history`, `task_comments`, `task_history`, `plans`, `corporate_plans`); para elas a contenção é integralmente da aplicação.

---

## Seção 4 — Incidente de 2026-09-29 (migrations aplicadas no banco errado)

**O que aconteceu.** Em 2026-09-29, durante esta análise, foi executado um `prisma migrate deploy` que atingiu o banco apontado no `.env` (Supabase, ambiente de produção) em vez de um banco local. Foram aplicadas duas migrations:

- `20260929000000_add_phase5_query_indexes` — 4 `CREATE INDEX IF NOT EXISTS` (aditivos): `queue_barbershopId_status_joinedAt_idx`, `expenses_barbershopId_referenceDate_idx`, `fiados_barbershopId_status_idx`, `appointments_date_idx`.
- `20260929000001_align_history_with_schema` — `ALTER TABLE "barbershops" ADD COLUMN IF NOT EXISTS "city"` e `DROP INDEX IF EXISTS "salon_clients_barbershopId_whatsapp_key"`.

**Verificação posterior (mesmo dia).**

- `prisma migrate status` → histórico **up-to-date** (as duas migrations registradas como aplicadas).
- `prisma migrate diff` → **sem diferença** entre o schema derivado das migrations e `prisma/schema.prisma`.
- **Efeito efetivo: apenas os 4 índices aditivos** da primeira migration. As demais statements eram `IF NOT EXISTS` / `IF EXISTS` e não tiveram efeito (nada já existente foi alterado, reescrito ou removido).

**Causas raiz.**

1. **O CLI do Prisma carrega o `.env` por padrão** — sem `-e`/`--env-file` explícito e sem URL validada, qualquer comando de escrita aponta para o banco do `.env` (neste repo, o Supabase de produção). Nada no repo neutraliza esse comportamento.
2. **O histórico de migrations contém migrations editadas depois de aplicadas** — o conteúdo em disco não é mais o que rodou originalmente, o que invalida a suposição de que "re-rodar é idempotente" e torna o resultado final sensível ao banco de destino.

**Ações preventivas.**

- **Nunca rodar comandos Prisma de escrita neste repo** (`migrate deploy`, `migrate dev`, `db push`, `migrate resolve/reset`, `migrate diff` com apply) **sem `-e` apontando para um arquivo de env neutralizado** (URL vazia/inexistente) **ou sem verificar explicitamente a URL alvo** antes do comando.
- Separar arquivos de env: `.env` local com banco local e um env de produção que não seja carregado implicitamente.
- Tratar migrations como imutáveis após aplicação; mudanças de histórico só via nova migration.
- Rodar `migrate diff`/`migrate status` (comandos de leitura) como hábito antes e depois de qualquer operação.
