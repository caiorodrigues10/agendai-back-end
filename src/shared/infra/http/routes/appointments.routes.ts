import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authorize } from '../middlewares/authorize'
import { checkSubscription } from '../middlewares/checkSubscription'
import { setRlsContext } from '../middlewares/setRlsContext'
import { AppointmentController } from '@/modules/appointments/controllers/AppointmentController'
import { CheckInAppointmentController } from '@/modules/appointments/useCases/checkIn/CheckInAppointmentController'
import { CompleteAppointmentController } from '@/modules/appointments/useCases/complete/CompleteAppointmentController'

/**
 * Contrato OpenAPI da criação. A validação de negócio continua no Zod da
 * aplicação; este schema documenta o payload e os campos aditivos da FASE 3.
 */
const appointmentCreateBodySchema = {
	type: 'object',
	required: ['barbershopId', 'serviceId', 'customerName', 'whatsapp', 'date', 'time'],
	properties: {
		barbershopId: { type: 'string', format: 'uuid' },
		serviceId: { type: 'string', format: 'uuid' },
		staffId: { type: 'string', format: 'uuid', nullable: true },
		customerName: { type: 'string', minLength: 2, maxLength: 200 },
		// Sem maxLength: o Zod valida o número após remover não-dígitos
		// (10–11 dígitos) e aceita string bruta mais longa que 20.
		whatsapp: { type: 'string', minLength: 10 },
		date: { type: 'string' },
		time: { type: 'string' },
		clientId: { type: 'string', format: 'uuid', nullable: true },
		clientPackageId: { type: 'string', format: 'uuid', nullable: true },
		petId: { type: 'string', format: 'uuid', nullable: true },
		caseId: { type: 'string', format: 'uuid', nullable: true },
		practiceArea: { type: 'string', minLength: 1, maxLength: 80, nullable: true },
		modality: { type: 'string', enum: ['IN_PERSON', 'VIDEO', 'PHONE'] },
		meetingLink: { type: 'string', format: 'uri', maxLength: 500, nullable: true },
		reservedProducts: {
			type: 'array',
			maxItems: 10,
			items: {
				type: 'object',
				required: ['productId', 'quantity'],
				properties: {
					productId: { type: 'string', format: 'uuid' },
					quantity: { type: 'integer', minimum: 1, maximum: 10 },
				},
			},
		},
		addons: {
			type: 'array',
			maxItems: 30,
			description: 'Adicionais do serviço; preço, duração e quantidade efetiva são validados no servidor.',
			items: {
				type: 'object',
				required: ['addonId', 'quantity'],
				properties: {
					addonId: { type: 'string', format: 'uuid' },
					quantity: { type: 'integer', minimum: 1, maximum: 100 },
				},
			},
		},
	},
} as const

const appointmentSlotsQuerySchema = {
	type: 'object',
	required: ['barbershopId', 'date', 'serviceId'],
	properties: {
		barbershopId: { type: 'string', format: 'uuid' },
		date: { type: 'string' },
		serviceId: { type: 'string', format: 'uuid' },
		staffId: { type: 'string', format: 'uuid' },
		addonIds: {
			type: 'string',
			maxLength: 1200,
			description: 'IDs de adicionais separados por vírgula.',
		},
		addonQuantities: {
			type: 'string',
			maxLength: 200,
			description: 'Quantidades alinhadas posição a posição aos addonIds.',
		},
	},
} as const

export async function appointmentsRoutes(app: FastifyInstance) {
	const appointments = new AppointmentController()
	const checkIn = new CheckInAppointmentController()
	const completeAppointment = new CompleteAppointmentController()

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
  // Rate-limit dedicado: máximo 5 bookings por minuto por IP (previne flooding)
  const publicBookingRateLimit = {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 minute",
      },
    },
  };

  app.post(
    '/appointments/public',
    {
      ...publicBookingRateLimit,
      schema: {
        tags: ['Appointments'],
        summary: 'Criar agendamento público',
        body: appointmentCreateBodySchema,
      },
    },
    appointments.createPublic.bind(appointments),
  )
  app.post('/appointments/public/session', appointments.publicSession.bind(appointments));
  app.get('/appointments/public/manage', appointments.publicManage.bind(appointments));
  app.post('/appointments/public/cancel', appointments.publicCancel.bind(appointments));
  app.post('/appointments/public/reschedule', appointments.publicReschedule.bind(appointments));
	app.get(
		'/appointments/availability',
		appointments.availability.bind(appointments),
	)
	app.get('/appointments/slots', {
		schema: {
			tags: ['Appointments'],
			summary: 'Calcular slots livres no servidor',
			querystring: appointmentSlotsQuerySchema,
		},
	}, appointments.slots.bind(appointments));

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
		{
			preHandler: staffGuard,
			schema: {
				tags: ['Appointments'],
				summary: 'Criar agendamento da equipe',
				body: appointmentCreateBodySchema,
			},
		},
		appointments.create.bind(appointments),
	)
	app.patch(
		'/appointments/:id',
		{ preHandler: staffGuard },
		appointments.update.bind(appointments),
	)

	// Check-in — staff autenticado
	app.post(
		'/appointments/:id/check-in',
		{ preHandler: staffGuard },
		checkIn.handle.bind(checkIn),
	)

	// Conclusão — staff autenticado
	app.post(
		'/appointments/:id/complete',
		{ preHandler: staffGuard },
		completeAppointment.handle.bind(completeAppointment),
	)

	// Cancelamento — apenas owner ou admin
	app.delete(
		'/appointments/:id',
		{ preHandler: ownerGuard },
		appointments.cancel.bind(appointments),
	)
}
