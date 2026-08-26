import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import { checkSubscription } from '../middlewares/checkSubscription'
import { setRlsContext } from '../middlewares/setRlsContext'
import { ReferralsController } from '@/modules/referrals/controllers/ReferralsController'

export async function referralsRoutes(app: FastifyInstance) {
	const controller = new ReferralsController()

	app.get(
		'/referrals/me',
		{
			preHandler: [
				authenticate,
				authorize(['OWNER', 'MASTER_ADMIN']),
				checkSubscription,
				setRlsContext,
			],
		},
		(req, reply) => controller.me(req, reply),
	)
}
