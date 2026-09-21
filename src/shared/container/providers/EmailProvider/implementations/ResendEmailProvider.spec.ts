import { afterEach, describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({
 Resend: class { emails = { send } },
}))
vi.mock('@/libs/prismaClient', () => ({ prisma: {} }))
import { ResendEmailProvider } from './ResendEmailProvider'

describe('ResendEmailProvider', () => {
 afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
 const input = {
  to: 'owner@example.com', subject: 'Teste', html: '<p>Teste</p>', text: 'Teste',
  template: 'password_changed' as const, trackLegacyDelivery: false,
  idempotencyKey: 'notification-stable-id',
 }

 it('passes the same idempotency key on repeated attempts', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('EMAIL_ALLOWLIST', '')
  send.mockResolvedValue({ data: { id: 'provider-id' }, error: null })
  const provider = new ResendEmailProvider()
  await provider.send(input)
  await provider.send(input)
  expect(send).toHaveBeenCalledTimes(2)
  for (const call of send.mock.calls) expect(call[1]).toEqual({ idempotencyKey: input.idempotencyKey })
 })

 it('uses the actual HTTP status when classifying a rate limit', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('EMAIL_ALLOWLIST', '')
  send.mockResolvedValue({ data: null, error: { name: 'rate_limit_exceeded', message: 'Rate limited', statusCode: 429 } })
  expect(await new ResendEmailProvider().send(input)).toMatchObject({ ok: false, errorKind: 'TRANSIENT' })
 })

 it('classifies network exceptions as retryable', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('EMAIL_ALLOWLIST', '')
  send.mockRejectedValue(new Error('fetch failed'))
  expect(await new ResendEmailProvider().send(input)).toMatchObject({ ok: false, errorKind: 'TRANSIENT' })
 })
})
