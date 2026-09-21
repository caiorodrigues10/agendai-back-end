import { describe, expect, it } from 'vitest'
import { agendaiEmailBase } from './agendaiEmailLayout'
import {
 buildPaymentApprovedEmail, buildSubscriptionRenewedEmail, buildSubscriptionCanceledEmail,
 buildWelcomeStaffEmail, buildDailyDigestEmail, buildPasswordChangedEmail,
} from './operationalEmails'
import { classifyResendError } from '@/shared/container/providers/EmailProvider/IEmailProvider'

describe('operational emails', () => {
 const owner = { ownerName: 'Maria <script>alert(1)</script>', email: 'owner@example.com', planName: 'Pro', amount: 49 }

 it('accepts dates serialized by Redis and formats them in the local timezone', () => {
  const queued = JSON.parse(JSON.stringify({ ...owner, nextBillingDate: new Date('2026-10-02T01:00:00Z') }))
  expect(buildPaymentApprovedEmail(queued).html).toContain('01/10/2026')
  expect(buildSubscriptionRenewedEmail(queued).html).toContain('01/10/2026')
  expect(buildSubscriptionCanceledEmail({ ...owner, endDate: queued.nextBillingDate }).text).toContain('01/10/2026')
 })

 it('rejects invalid dates rather than sending Invalid Date', () => {
  expect(() => buildPaymentApprovedEmail({ ...owner, nextBillingDate: 'invalid' })).toThrow('Data inválida')
 })

 it('escapes user content and URL attributes', () => {
  const email = buildWelcomeStaffEmail({
   staffName: '<script>alert(1)</script>', barbershopName: '<img src=x onerror=alert(1)>',
   email: owner.email, inviteUrl: 'https://example.com/invite?a=1&b=2',
  })
  expect(email.html).not.toContain('<script>')
  expect(email.html).not.toContain('<img src=x')
  expect(email.html).toContain('a=1&amp;b=2')
 })

 it.each(['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@example.com'])('rejects unsafe link %s', (ctaUrl) => {
  expect(() => agendaiEmailBase({ title: 'Teste', bodyHtml: '<p>Olá</p>', ctaLabel: 'Abrir', ctaUrl })).toThrow()
 })

 it('uses actual application routes and escapes appointment content', () => {
  const digest = buildDailyDigestEmail({
   ...owner, date: '2026-10-01', appointments: [{ time: '10:00', clientName: '<script>x</script>', serviceName: 'Corte' }],
   totalScheduled: 1, cancelledToday: 0,
  })
  expect(digest.html).toContain('/app/appointments')
  expect(digest.html).not.toContain('<script>')
  expect(buildPasswordChangedEmail(owner).text).toContain('/esqueci-senha')
 })

 it('provides readable dark-mode selectors and places preheader inside body', () => {
  const html = agendaiEmailBase({ title: 'Teste', preheader: 'Resumo', bodyHtml: '<p>Texto</p>' })
  expect(html).toContain('class="email-content body-text"')
  expect(html).toContain('.body-text { color:#E8F1ED !important; }')
  expect(html.indexOf('Resumo')).toBeGreaterThan(html.indexOf('<body'))
 })

 it.each([
  [{ httpStatus: 429 }, 'TRANSIENT'],
  [{ name: 'rate_limit_exceeded' }, 'TRANSIENT'],
  [{ httpStatus: 503 }, 'TRANSIENT'],
  [{ message: 'fetch failed' }, 'TRANSIENT'],
  [{ name: 'invalid_api_key', httpStatus: 401 }, 'CONFIG'],
  [{ name: 'missing_dns_record' }, 'CONFIG'],
  [{ name: 'validation_error', httpStatus: 422 }, 'PERMANENT'],
  [{ name: 'bounced' }, 'PERMANENT'],
 ] as const)('classifies provider failure %j as %s', (input, expected) => {
  expect(classifyResendError(input)).toBe(expected)
 })
})
