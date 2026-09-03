import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';
import { readPublicAppointmentToken } from '../services/publicAppointmentToken';
import { authenticate } from '@/shared/infra/http/middlewares/authenticate';
import { authorize } from '@/shared/infra/http/middlewares/authorize';
import { checkSubscription } from '@/shared/infra/http/middlewares/checkSubscription';
import { setRlsContext } from '@/shared/infra/http/middlewares/setRlsContext';

const reviewSchema = z.object({ token: z.string().min(20).max(4096), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() });

export async function reviewRoutes(app: FastifyInstance) {
  app.get('/barbershops/:id/reviews', async (request, reply) => {
    const barbershopId = (request.params as { id: string }).id;
    const staffId = (request.query as { staffId?: string }).staffId;
    const reviews = await prisma.clientReview.findMany({ where: { barbershopId, status: 'PUBLISHED', ...(staffId ? { staffId } : {}) }, orderBy: { createdAt: 'desc' }, take: 20, select: { rating: true, comment: true, response: true, createdAt: true, staff: { select: { name: true } } } });
    const aggregate = await prisma.clientReview.aggregate({ where: { barbershopId, status: 'PUBLISHED' }, _avg: { rating: true }, _count: { _all: true } });
    reply.send({ success: true, data: { average: aggregate._avg.rating ?? 0, count: aggregate._count._all, reviews } });
  });

  app.post('/appointments/public/review', async (request, reply) => {
    const body = reviewSchema.parse(request.body);
    const token = readPublicAppointmentToken(body.token, 'manage');
    const appointment = await prisma.appointment.findFirst({ where: { id: token.sub, barbershopId: token.barbershopId, publicAccessVersion: token.version }, select: { id: true, barbershopId: true, clientId: true, staffId: true, status: true, updatedAt: true } });
    if (!appointment || appointment.status !== 'COMPLETED') throw new AppError('A avaliação ficará disponível após o atendimento.', 409, undefined, 'REVIEW_NOT_AVAILABLE');
    if (Date.now() - appointment.updatedAt.getTime() > 14 * 24 * 60 * 60 * 1000) throw new AppError('O prazo para avaliar este atendimento terminou.', 410, undefined, 'REVIEW_EXPIRED');
    try {
      const review = await prisma.clientReview.create({ data: { barbershopId: appointment.barbershopId, appointmentId: appointment.id, clientId: appointment.clientId, staffId: appointment.staffId, rating: body.rating, comment: body.comment || null } });
      reply.status(201).send({ success: true, data: review });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new AppError('Este atendimento já foi avaliado.', 409, undefined, 'REVIEW_ALREADY_SUBMITTED');
      throw error;
    }
  });

  app.patch('/reviews/:id', { preHandler: [authenticate, authorize(['MASTER_ADMIN', 'OWNER']), checkSubscription, setRlsContext] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = z.object({ response: z.string().trim().min(2).max(1000).optional(), report: z.boolean().optional() }).parse(request.body);
    const review = await prisma.clientReview.findUnique({ where: { id }, select: { id: true, barbershopId: true } });
    if (!review || (request.user!.role !== 'MASTER_ADMIN' && review.barbershopId !== request.user!.barbershopId)) throw new AppError('Avaliação não encontrada', 404);
    const updated = await prisma.clientReview.update({ where: { id }, data: { ...(body.response !== undefined ? { response: body.response, respondedAt: new Date() } : {}), ...(body.report ? { status: 'REPORTED', reportedAt: new Date() } : {}) } });
    reply.send({ success: true, data: updated });
  });
}
