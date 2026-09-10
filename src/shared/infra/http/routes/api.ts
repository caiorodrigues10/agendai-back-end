import { FastifyInstance } from 'fastify'
import { usersRoutes } from './users.routes'
import { servicesRoutes } from './services.routes'
import { barbershopsRoutes } from './barbershops.routes'
import { queueRoutes } from './queue.routes'
import { authRoutes } from './auth.routes'
import { adminRoutes } from './admin.routes'
import { adminFinancialRoutes } from './adminFinancial.routes'
import { paymentRoutes } from './payments.routes'
import { plansRoutes } from './plans.routes'
import { fiadoRoutes } from './fiado.routes'
import { expensesRoutes } from './expenses.routes'
import { barbershopFinancialRoutes } from './barbershopFinancialRoutes'
import { categoriesRoutes } from './categories.routes'
import { appointmentsRoutes } from './appointments.routes'
import { feedRoutes } from './feed.routes'
import { notificationsRoutes } from './notifications.routes'
import { contactRoutes } from './contact.routes'
import { referralsRoutes } from './referrals.routes'
import { postsRoutes } from './posts.routes'
import { clientsRoutes } from './clients.routes'
import { packagesRoutes } from './packages.routes'
import { commissionsRoutes } from './commissions.routes'
import { crmRoutes } from './crm.routes'
import { productsRoutes } from './products.routes'
import { onboardingRoutes } from '@/modules/barbershops/routes/onboarding.routes'
import { calendarRoutes } from '@/modules/barbershops/routes/calendar.routes'
import { reviewRoutes } from '@/modules/appointments/routes/review.routes'
import { webhooksRoutes } from './webhooks.routes'
import { realtimeWsRoutes } from './ws.routes'
import { dailyCloseoutRoutes } from './dailyCloseout.routes'
import { monitoringRoutes } from '@/modules/monitoring/monitoringRoutes'
import { activationRoutes } from '@/modules/analytics/routes/activation.routes'
import { analyticsRoutes } from '@/modules/analytics/routes/analytics.routes'
import { cashMovementRoutes } from '@/modules/cash/cashMovement.routes'
import { loyaltyRoutes } from '@/modules/loyalty/loyalty.routes'
import { goalRoutes } from '@/modules/goals/goal.routes'
import { depositRoutes } from '@/modules/deposits/deposit.routes'
import { waitlistRoutes } from '@/modules/waitlist/waitlist.routes'
import { membershipRoutes } from '@/modules/memberships/membership.routes'
import { showcaseRoutes } from '@/modules/showcase/showcase.routes'
import { catalogRoutes } from '@/modules/catalog/catalog.routes'
import { clientPortalRoutes } from '@/modules/clientPortal/clientPortal.routes'
import { organizationRoutes } from '@/modules/organizations/organization.routes'
import { visitRoutes } from '@/modules/visits/visit.routes'
import { resourceRoutes } from '@/modules/resources/resource.routes'
import { profitRoutes } from '@/modules/profit/profit.routes'
import { giftCardRoutes } from '@/modules/giftCards/giftCard.routes'
import { formRoutes } from '@/modules/forms/form.routes'
import { staffRoutes } from '@/modules/staff/staff.routes'
import { qualityRoutes } from '@/modules/quality/quality.routes'
import { purchasingRoutes } from '@/modules/purchasing/purchasing.routes'
import { copilotRoutes } from '@/modules/copilot/copilot.routes'
import { corporateRoutes } from '@/modules/corporate/corporate.routes'
import { reputationRoutes } from '@/modules/reputation/reputation.routes'
import { walletRoutes } from '@/modules/wallet/wallet.routes'
import { pricingRoutes } from '@/modules/pricing/pricing.routes'
import { voucherRoutes } from '@/modules/vouchers/voucher.routes'
import { fiscalRoutes } from '@/modules/fiscal/fiscal.routes'
import { integrationRoutes } from '@/modules/integrations/integration.routes'
import { whatsappAiRoutes } from '@/modules/whatsappAi/whatsappAi.routes'

export async function apiRoutes(app: FastifyInstance) {
	await realtimeWsRoutes(app)
	await authRoutes(app)
	await usersRoutes(app)
	await servicesRoutes(app)
	await barbershopsRoutes(app)
	await queueRoutes(app)
	await appointmentsRoutes(app)
	await adminRoutes(app)
	await adminFinancialRoutes(app)
	await paymentRoutes(app)
	await plansRoutes(app)
	await fiadoRoutes(app)
	await expensesRoutes(app)
	await barbershopFinancialRoutes(app)
	await categoriesRoutes(app)
	await feedRoutes(app)
	await notificationsRoutes(app)
	await contactRoutes(app)
	await referralsRoutes(app)
	await postsRoutes(app)
	await clientsRoutes(app)
	await packagesRoutes(app)
	await commissionsRoutes(app)
	await crmRoutes(app)
	await productsRoutes(app)
	await onboardingRoutes(app)
	await calendarRoutes(app)
	await reviewRoutes(app)
	await webhooksRoutes(app)
	await dailyCloseoutRoutes(app)
	await monitoringRoutes(app)
	await activationRoutes(app)
	await analyticsRoutes(app)
	await cashMovementRoutes(app)
	await loyaltyRoutes(app)
	await goalRoutes(app)
	await depositRoutes(app)
	await waitlistRoutes(app)
	await membershipRoutes(app)
	await showcaseRoutes(app)
	await catalogRoutes(app)
	await clientPortalRoutes(app)
	await organizationRoutes(app)
	await visitRoutes(app)
	await profitRoutes(app)
	await giftCardRoutes(app)
	await pricingRoutes(app)
	await voucherRoutes(app)
	await resourceRoutes(app)
	await copilotRoutes(app)
	await corporateRoutes(app)
	await reputationRoutes(app)
	await walletRoutes(app)
	await qualityRoutes(app)
	await purchasingRoutes(app)
	await formRoutes(app)
	await staffRoutes(app)
	await fiscalRoutes(app)
	await integrationRoutes(app)
	await whatsappAiRoutes(app)
}
