export type EmailTemplateId =
	| 'welcome'
	| 'referral_applied'
	| 'referral_converted'
	| 'referral_revoked'
	| 'verify_email'
	| 'forgot_password'

export interface SendEmailInput {
	to: string
	subject: string
	html: string
	text: string
	/** Identificador do template para log/audit */
	template: EmailTemplateId
	/** Metadados opcionais (JSON-serializáveis) */
	metadata?: Record<string, unknown>
	/** Compatibilidade: o ledger V2 ja registra a entrega. */
	trackLegacyDelivery?: boolean
}

export interface SendEmailResult {
	ok: boolean
	providerId?: string
	error?: string
	/** true quando só logou (sem API key / modo console) */
	skipped?: boolean
}

export interface IEmailProvider {
	send(input: SendEmailInput): Promise<SendEmailResult>
}
