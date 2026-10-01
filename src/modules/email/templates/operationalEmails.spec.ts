import { describe, expect, it } from 'vitest'
import { agendaiEmailBase } from './agendaiEmailLayout'
import {
 buildPaymentApprovedEmail, buildSubscriptionRenewedEmail, buildSubscriptionCanceledEmail,
 buildWelcomeStaffEmail, buildDailyDigestEmail, buildPasswordChangedEmail,
 buildProductReservationAlertEmail,
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

describe('product reservation alert email', () => {
 const base = {
  email: 'owner@example.com',
  ownerName: 'Maria Silva',
  barbershopName: 'Barbearia <img src=x onerror=alert(1)> Central',
  productName: 'Shampoo & condicionador',
  quantity: 2,
  customerName: 'Ana <script>alert(1)</script>',
  customerWhatsapp: '11988887777',
  total: 80,
  expiresAt: new Date('2026-10-03T18:00:00.000Z'),
 }

 it('monta assunto, corpo e botão para o painel de produtos', () => {
  const email = buildProductReservationAlertEmail({
   ...base,
   productName: 'Shampoo',
   panelUrl: 'https://app.exemplo.com/app/products',
  })

  expect(email.subject).toBe('Nova reserva de produto — Shampoo')
  expect(email.template).toBe('product_reservation_alert')
  expect(email.text).toContain('https://app.exemplo.com/app/products')
  expect(email.html).toContain('https://app.exemplo.com/app/products')
  expect(email.html).toContain('Ver reservas')
  expect(email.text).toContain('2× Shampoo')
  expect(email.text).toContain('11988887777')
  expect(email.html).toMatch(/R\$\s*80,00/)
 })

 it('usa a URL pública do painel quando panelUrl não vem na fila', () => {
  const email = buildProductReservationAlertEmail(base)
  expect(email.html).toContain('/app/products')
  expect(email.text).toContain('/app/products')
 })

 it('escapa todo dado vindo do cliente e do salão', () => {
  const email = buildProductReservationAlertEmail(base)

  expect(email.html).not.toContain('<script>')
  expect(email.html).not.toContain('<img src=x')
  expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(email.html).toContain('Shampoo &amp; condicionador')
 })

 it('quebra de linha no nome não injeta assunto com múltiplas linhas', () => {
  const email = buildProductReservationAlertEmail({ ...base, productName: 'Pomada\nBCC: hack@exemplo.com' })
  expect(email.subject).toBe('Nova reserva de produto — Pomada BCC: hack@exemplo.com')
 })

 it('mostra o prazo de retirada no horário local', () => {
  expect(buildProductReservationAlertEmail(base).html).toContain('03/10/2026')
 })
})
