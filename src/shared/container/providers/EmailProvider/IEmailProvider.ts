/**
 * Catálogo canônico de templates de e-mail da plataforma.
 *
 * Cada template daqui tem um builder em `src/modules/email/templates/` e
 * registra-se no ledger V1 (`EmailDelivery.template`) e no ledger V2
 * (`NotificationDelivery.type` via `notificationRegistry`).
 */
export type EmailTemplateId =
	| 'welcome'
	| 'welcome_staff'
	| 'referral_applied'
	| 'referral_converted'
	| 'referral_revoked'
	| 'verify_email'
	| 'forgot_password'
	| 'password_changed'
	| 'payment_approved'
	| 'payment_failed'
	| 'subscription_trial_ending'
	| 'subscription_trial_ended'
	| 'subscription_canceled'
	| 'subscription_renewed'
	| 'subscription_renewal_failed'
	| 'daily_digest'
	| 'appointment_urgent_cancelled'
	| 'appointment_urgent_rescheduled'

/**
 * Classificação de erro do provider.
 * - `TRANSIENT`: problema temporário → novo retry permitido (worker requeue).
 * - `PERMANENT`: falha de destinatário (bounce/suppression) → sem retry automático.
 * - `CONFIG`: provider não configurado/sem auth — não é falha de entrega.
 */
export type EmailErrorKind = 'TRANSIENT' | 'PERMANENT' | 'CONFIG'

/** Classifica códigos e status retornados pelo SDK Resend. */
export function classifyResendError(input: {
 message?: string | null
 name?: string | null
 httpStatus?: number | null
}): EmailErrorKind {
 const code = (input.name ?? '').toLowerCase()
 const status = input.httpStatus
 if (['missing_api_key', 'invalid_api_key', 'restricted_api_key', 'invalid_from_address',
  'invalid_access', 'missing_dns_record', 'monthly_quota_exceeded', 'daily_quota_exceeded',
  'security_error'].includes(code) || status === 401 || status === 403) return 'CONFIG'
 if (['rate_limit_exceeded', 'concurrent_idempotent_requests', 'application_error',
  'internal_server_error'].includes(code) || status === 429 || status === 408 ||
  (status != null && status >= 500)) return 'TRANSIENT'
 if (['validation_error', 'invalid_parameter', 'missing_required_field', 'invalid_attachment',
  'invalid_idempotency_key', 'invalid_idempotent_request', 'bounced', 'suppressed',
  'invalid_send'].includes(code) || (status != null && status >= 400)) return 'PERMANENT'
 // Falhas sem resposta HTTP (rede, timeout) podem ser tentadas novamente.
 return 'TRANSIENT'
}

export interface SendEmailInput {
	to: string
	subject: string
	html: string
	text: string
	/** Identificador do template para log/audit */
	template: EmailTemplateId
	/** Metadados opcionais (JSON-serializáveis) */
	metadata?: Record<string, unknown>
	/**
	 * Chave de idempotência semântica deste envio (ex.: `subscription:activated:sub_123`).
	 * Enviada ao Resend para deduplicar tentativas do mesmo evento.
	 * O caller deve manter a mesma chave em todas as tentativas.
	 */
	idempotencyKey?: string
	/**
	 * Tags arbitárias (aparecem no dashboard do Resend e voltam no webhook).
	 * Ex.: `{ tenant: 'agendai', module: 'subscriptions' }`.
	 */
	tags?: Record<string, string>
	/**
	 * Headers SMTP custom (ex.: `X-AgendAI-Event`). Não use para conteúdo dinâmico.
	 */
	headers?: Record<string, string>
	/** Compatibilidade: o ledger V2 já registra a entrega — desative em fluxos que já criaram delivery próprio. */
	trackLegacyDelivery?: boolean
}

export interface SendEmailResult {
	ok: boolean
	/** id retornado pelo Resend — referência para rastrear via webhook */
	providerId?: string
	error?: string
	/** Classificação do erro (quando ok = false). */
	errorKind?: EmailErrorKind
	/** Chave de idempotência propagada. */
	idempotencyKey?: string
	/** true quando só logou (sem API key / modo console) */
	skipped?: boolean
}

export interface IEmailProvider {
	send(input: SendEmailInput): Promise<SendEmailResult>
}
