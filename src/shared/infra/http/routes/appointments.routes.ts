import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import { checkSubscription } from '../middlewares/checkSubscription'
import { setRlsContext } from '../middlewares/setRlsContext'
import { AppointmentController } from '@/modules/appointments/controllers/AppointmentController'

export async function appointmentsRoutes(app: FastifyInstance) {
	const appointments = new AppointmentController()

	const staffGuard = [
		authenticate,
		authorize(['MASTER_ADMIN', 'OWNER', 'EMPLOYEE']),
		checkSubscription,
		setRlsContext,
	]

	const ownerGuard = [
		authenticate,
		authorize(['MASTER_ADMIN', 'OWNER']),
		checkSubscription,
		setRlsContext,
	]

	// Disponibilidade de horários — pública (cliente escolhe horário antes de logar)

  // Agendamento público — sem necessidade de autenticação
  app.post(
    '/appointments/public',
    appointments.createPublic.bind(appointments),
  )
	app.get(
		'/appointments/availability',
		appointments.availability.bind(appointments),
	)

	// Listagem e consulta — qualquer staff autenticado
	app.get(
		'/appointments',
		{ preHandler: staffGuard },
		appointments.list.bind(appointments),
	)
	app.get(
		'/appointments/:id',
		{ preHandler: staffGuard },
		appointments.get.bind(appointments),
	)

	// Criação e atualização — staff autenticado
	app.post(
		'/appointments',
		{ preHandler: staffGuard },
		appointments.create.bind(appointments),
	)
	app.patch(
		'/appointments/:id',
		{ preHandler: staffGuard },
		appointments.update.bind(appointments),
	)

	// Cancelamento — apenas owner ou admin
	app.delete(
		'/appointments/:id',
		{ preHandler: ownerGuard },
		appointments.cancel.bind(appointments),
	)
}
