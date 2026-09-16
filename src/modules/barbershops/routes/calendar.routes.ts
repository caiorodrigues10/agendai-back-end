import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';
import { authenticate } from '@/shared/infra/http/middlewares/authenticate';
import { authorize } from '@/shared/infra/http/middlewares/authorize';
import { checkSubscription } from '@/shared/infra/http/middlewares/checkSubscription';
import { setRlsContext } from '@/shared/infra/http/middlewares/setRlsContext';

const id = z.string().uuid();
const policySchema = z.object({
  bookingNoticeMinutes: z.number().int().min(0).max(10080).optional(),
  cancelNoticeMinutes: z.number().int().min(0).max(10080).optional(),
  rescheduleNoticeMinutes: z.number().int().min(0).max(10080).optional(),
  bookingHorizonDays: z.number().int().min(1).max(365).optional(),
  allowPublicCancellation: z.boolean().optional(),
  allowPublicReschedule: z.boolean().optional(),
  requestReview: z.boolean().optional(),
});
const blockSchema = z.object({
  staffId: id.nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().trim().min(2).max(200),
  recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).default('NONE'),
  recurrenceUntil: z.string().datetime().nullable().optional(),
});

function shopId(request: any, rawId: string) {
  if (request.user.role !== 'MASTER_ADMIN' && request.user.barbershopId !== rawId) throw new AppError('Acesso negado', 403);
  return rawId;
}

export async function calendarRoutes(app: FastifyInstance) {
  const guard = [authenticate, authorize(['MASTER_ADMIN', 'OWNER', 'EMPLOYEE']), checkSubscription, setRlsContext];
  const ownerGuard = [authenticate, authorize(['MASTER_ADMIN', 'OWNER']), checkSubscription, setRlsContext];

  app.get('/barbershops/:id/appointment-policy', { preHandler: ownerGuard }, async (request, reply) => {
    const barbershopId = shopId(request, (request.params as any).id);
    const policy = await prisma.appointmentPolicy.upsert({ where: { barbershopId }, create: { barbershopId }, update: {} });
    reply.send({ success: true, data: policy });
  });

  app.patch('/barbershops/:id/appointment-policy', { preHandler: ownerGuard }, async (request, reply) => {
    const barbershopId = shopId(request, (request.params as any).id);
    const data = policySchema.parse(request.body);
    const policy = await prisma.appointmentPolicy.upsert({ where: { barbershopId }, create: { barbershopId, ...data }, update: data });
    reply.send({ success: true, data: policy });
  });

  app.get('/barbershops/:id/calendar-blocks', { preHandler: guard }, async (request, reply) => {
    const barbershopId = shopId(request, (request.params as any).id);
    const query = request.query as { from?: string; to?: string; staffId?: string };
    const blocks = await prisma.calendarBlock.findMany({ where: { barbershopId, ...(query.staffId ? { staffId: query.staffId } : {}), ...(query.from || query.to ? { startAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) }, orderBy: { startAt: 'asc' } });
    reply.send({ success: true, data: blocks });
  });

  app.post('/barbershops/:id/calendar-blocks', { preHandler: guard }, async (request, reply) => {
    const barbershopId = shopId(request, (request.params as any).id);
    const data = blockSchema.parse(request.body);
    const startAt = new Date(data.startAt); const endAt = new Date(data.endAt);
    if (endAt <= startAt) throw new AppError('O fim do bloqueio deve ser posterior ao início', 400);
    if (data.staffId) {
      const staff = await prisma.user.findFirst({ where: { id: data.staffId, barbershopId, active: true, role: { in: ['OWNER', 'EMPLOYEE'] } }, select: { id: true } });
      if (!staff) throw new AppError('Profissional inválido para este salão', 400);
    }
    const block = await prisma.calendarBlock.create({ data: { barbershopId, createdById: request.user!.id, staffId: data.staffId ?? null, startAt, endAt, reason: data.reason, recurrence: data.recurrence, recurrenceUntil: data.recurrenceUntil ? new Date(data.recurrenceUntil) : null } });
    reply.status(201).send({ success: true, data: block });
  });

  app.delete('/barbershops/:id/calendar-blocks/:blockId', { preHandler: guard }, async (request, reply) => {
    const barbershopId = shopId(request, (request.params as any).id);
    const block = await prisma.calendarBlock.findFirst({ where: { id: (request.params as any).blockId, barbershopId }, select: { id: true } });
    if (!block) throw new AppError('Bloqueio não encontrado', 404);
    await prisma.calendarBlock.delete({ where: { id: block.id } });
    reply.status(204).send();
  });
}
