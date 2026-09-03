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

export async function apiRoutes(app: FastifyInstance) {
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
}
