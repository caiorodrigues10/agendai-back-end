# Inventário de marca — Agenda Já (backend)

> Troca de marca `AgendAI` / `AGENDAI` → **Agenda Já** (2026-09-26).
> Escopo: apresentação gerada pelo backend. Sem alteração de contratos, schemas, preços, permissões ou regras de negócio; nenhum seed/migração executado.
> Além disso, as alterações locais pré-existentes (remoção do webhook Resend, doc de operações, migration `fix_schema_drift_v2`) foram preservadas e estão fora deste inventário (baseline em `be-preexisting.patch`).

## 1. Alterada

| Área | Arquivos / detalhes |
|---|---|
| Layout/base de e-mails | `agendaiEmailLayout.ts` (marca no cabeçalho `alt`, wordmark, rodapé — via constante), `emailLayout.ts` (legado: wordmark `AGENDA JÁ`, rodapé) |
| Templates | `authEmails.ts` (verificação de e-mail, recuperação de senha), `operationalEmails.ts` (15: senha, pagamento, trial, convite, cancelamento, reagendamento…), `referralEmails.ts` (5), `welcomeEmail.ts` (2), todos via `${BRAND_NAME}` |
| Remetente | `ResendEmailProvider` fallback `Agenda Já <onboarding@resend.dev>` (endereço preservado); `.env.example` `EMAIL_FROM` de exemplo |
| Galeria de demonstração | `emailGallery.routes.ts` (badge + rodapé, via constante) |
| Cobranças/assinaturas (novas) | `SubscribeUseCase`, `ChargeTrialEndedSubscriptionsUseCase`, `handleSubscriptionPaymentWebhook` (fallback `Assinatura Agenda Já`), `scripts/sim-abacate-seed-payment.ts`, specs (Asaas/refunds/subscribe) |
| WhatsApp/mensagens | `queueCapacityAlert`, `referralService`, `whatsappAiUseCases` (2 mensagens canned) |
| Posts | `postImageService.ts` (wordmark desenhada no SVG + comentário), `postPalettes.ts` (`Marca Agenda Já`), `postImageService.spec.ts` |
| API/docs | `swagger.ts` (`Agenda Já API`), `README.md`, `AGENTS.md`, `copilot-instructions`, `GCS_SETUP`, `CLOUDINARY_SETUP`, `PENTEST_LOCAL`, `docs/agents` (só se houver marca), `system-docs` (exceto histórico) |
| Cadastro/demo | `InviteTeamMemberUseCase`/`ResendInvitationUseCase` (fallback), `SubmitContactMessageUseCase`, `prisma/seed.ts` + `prisma/demo/crm_demo.sql` (`Agenda Já CRM Demo` — consistentes entre si; **não executados**) |
| Infra/config | `.env.example` (cabeçalho + exemplo), `docker-entrypoint.sh` (log), `deploy.sh`, `create-service-account.sh` (display name de **novas** SA), `monitor-routes.js` |

**Constante:** `src/config/brand.ts` — `BRAND_NAME`/`BRAND_NAME_UPPER`, reutilizada nos geradores principais (todos os templates de e-mail, galeria, posts, swagger, cobranças, mensagens e fallbacks).

**Ajustes de gênero:** `no AgendAI` → `na Agenda Já`, `o` → `a`, `ao` → `à`, `assinou o` → `assinou a`, `Bem-vindo ao` → `Bem-vindo à`, etc.

## 2. Exceção técnica (preservadas, deliberadas)

- **Headers/metadata:** `X-AgendAI-Event` (exemplo de header), `X-Product-Id: agendai` (Mercado Pago), `tenant: 'agendai'`.
- **`CONFIG_SESSION_PHONE_CLIENT=AgendAI`** (`.env.evolution`): nome de sessão Evolution existente — mudar poderia afetar integração já configurada.
- **User-Agent `AgendaJa/1.4`**: forma sem acento/espaço por gramática de User-Agent (RFC 7234); contato na URL preservado. Produção usa env `WEATHER_USER_AGENT` — **verificar no Render**.
- **Conexões/credenciais:** `agendai:agendai123@…`, `POSTGRES_USER/DB`, `.env.test`, usuário de teste, `admin@agendai.local`, `system@agendai.internal`, `deleted-…@agendai.local`.
- **Infra:** bucket `agendai-assets`, service account `agendai-api@…`, chaves Redis/cache `agendai:*` (`heartbeat`, `idempotency`, `realtime`), diretórios, `docker-compose*`, `ci.yml`.
- **Nomes de código/arquivo:** `agendaiEmailLayout.ts`, `agendaiEmailBase()` (consumido por specs) — renomear quebraria identificadores.
- **`agendai.app`** no rodapé de e-mails/posts e dumps `agendai-render-*` (URLs/artefatos).

## 3. Histórico preservado

- `AI_GUIDE.md` (rotulado "guia histórico"), `system-docs/MANUAL.md` (detalhe histórico segundo o AGENTS.md), `docs/pentest/2026-08-*.md` (relatórios datados), `agendai-render-contents.txt` + `agendai-render-pre-migration.dump` (artefatos de migração).
- **Nunca alterado:** migrations antigas, mensagens já enviadas, cobranças/assinaturas registradas, registros financeiros, IDs de provedores/referências externas. Nada foi reenviado nem recriado.

## 4. Publicação coordenada (ações fora do código)

- **Render (API):** `EMAIL_FROM="Agenda Já <noreply@…>"` — só o fallback do código não cobre produção. Verificar `WEATHER_USER_AGENT`.
- **Deploy:** publicar backend + frontend + nome do remetente juntos; URLs/domínios `agendai` mantidos (exceção deliberada).
- **Externos:** display name da Service Account no GCP/consentimento Google e nomes exibidos em checkout hospedado dependem da config de cada serviço.
- **Retorno:** possível revertendo os commits — sem migração de dados (nada de schema/seed).

## 5. Validação executada

`typecheck` ✓ · `test:unit` 771/771 ✓ · `build` (tsup) ✓ · `docs:check` ✓ · auditoria final por variante antiga: 10 caixa-alta (todos classificados acima) + restantes exclusivamente minúsculos técnicos/históricos.
