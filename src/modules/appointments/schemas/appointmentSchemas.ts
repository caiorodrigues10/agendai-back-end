import { z } from 'zod'
import { isValidDate, isNotPast, isWithinHorizon, isBusinessHour } from '@/shared/utils/dateUtils'

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const phoneBR = z
	.string()
	.transform((v) => v.replace(/\D/g, ""))
	.refine((v) => v.length >= 10 && v.length <= 11, {
		message: "WhatsApp inválido (DDD + número com 8 ou 9 dígitos)",
	});

const dateField = z
	.string()
	.refine((v) => isValidDate(v), { message: 'Data inválida (use YYYY-MM-DD)' })
	.refine((v) => isNotPast(v), { message: 'Data não pode ser no passado' })
	.refine((v) => isWithinHorizon(v), { message: 'Data muito distante (máximo 60 dias)' })

const timeField = z
	.string()
	.regex(timeRegex, 'Hora deve ser no formato HH:MM')
	.refine((v) => isBusinessHour(v), { message: 'Horário fora do comercial (07:00–22:00)' })

export const createAppointmentSchema = z.object({
	barbershopId: z.string().uuid('barbershopId inválido'),
	serviceId: z.string().uuid('serviceId inválido'),
	staffId: z.string().uuid('staffId inválido').optional().nullable(),
	customerName: z.string().min(2, 'Nome obrigatório').max(200),
	whatsapp: phoneBR,
	date: dateField,
	time: timeField,
	clientId: z.string().uuid().optional().nullable(),
	clientPackageId: z.string().uuid().optional().nullable(),
})

export const updateAppointmentSchema = z.object({
	staffId: z.string().uuid().optional().nullable(),
	customerName: z.string().min(2).max(200).optional(),
	whatsapp: phoneBR.optional(),
	date: dateField.optional(),
	time: timeField.optional(),
	status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
})

export const availabilityQuerySchema = z.object({
	barbershopId: z.string().uuid('barbershopId inválido'),
	date: dateField,
	staffId: z.string().uuid('staffId inválido').optional(),
})

export const listAppointmentsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
	staffId: z.string().uuid().optional(),
	search: z.string().max(100).optional(),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>
