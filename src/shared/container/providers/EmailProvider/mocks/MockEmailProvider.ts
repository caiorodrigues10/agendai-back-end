import type {
	IEmailProvider,
	SendEmailInput,
	SendEmailResult,
} from '../IEmailProvider'

export class MockEmailProvider implements IEmailProvider {
	public sent: SendEmailInput[] = []

	async send(input: SendEmailInput): Promise<SendEmailResult> {
		this.sent.push(input)
		return { ok: true, providerId: `mock-${this.sent.length}` }
	}
}
