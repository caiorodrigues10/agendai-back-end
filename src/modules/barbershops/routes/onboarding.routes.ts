import { FastifyInstance } from 'fastify';
import { authenticate } from '@/shared/infra/http/middlewares/authenticate';
import { authorize } from '@/shared/infra/http/middlewares/authorize';
import { checkSubscription } from '@/shared/infra/http/middlewares/checkSubscription';
import { setRlsContext } from '@/shared/infra/http/middlewares/setRlsContext';
import { GetOnboardingUseCase } from '../useCases/onboarding/GetOnboardingUseCase';
import { UpdateOnboardingStepUseCase } from '../useCases/onboarding/UpdateOnboardingStepUseCase';
import { container } from 'tsyringe';
import { prisma } from '@/libs/prismaClient';

export async function onboardingRoutes(app: FastifyInstance) {
  const ownerGuard = [authenticate, authorize(['OWNER', 'MASTER_ADMIN']), checkSubscription, setRlsContext];

  app.get('/barbershops/:id/onboarding', { preHandler: ownerGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    const useCase = container.resolve(GetOnboardingUseCase);
    const result = await useCase.execute(id, user.id, user.role, user.barbershopId);
    reply.send({ success: true, data: result });
  });

  app.post('/barbershops/:id/onboarding/steps', { preHandler: ownerGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { step } = request.body as { step: string };
    const user = request.user!;
    const useCase = container.resolve(UpdateOnboardingStepUseCase);
    const result = await useCase.execute(id, step as never, user.role, user.barbershopId);
    reply.send({ success: true, data: result });
  });

  app.post('/barbershops/:id/onboarding/welcome-seen', { preHandler: ownerGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    if (user.role !== 'MASTER_ADMIN' && user.barbershopId !== id) return reply.code(403).send({ success: false, message: 'Acesso negado' });
    const onboarding = await prisma.barbershopOnboarding.upsert({ where: { barbershopId: id }, create: { barbershopId: id, welcomeSeenAt: new Date() }, update: { welcomeSeenAt: new Date() } });
    return reply.send({ success: true, data: onboarding });
  });

  app.post('/barbershops/:id/onboarding/dismiss', { preHandler: ownerGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    if (user.role !== 'MASTER_ADMIN' && user.barbershopId !== id) return reply.code(403).send({ success: false, message: 'Acesso negado' });
    const onboarding = await prisma.barbershopOnboarding.upsert({ where: { barbershopId: id }, create: { barbershopId: id, dismissedAt: new Date() }, update: { dismissedAt: new Date() } });
    return reply.send({ success: true, data: onboarding });
  });

  app.post('/barbershops/:id/onboarding/reopen', { preHandler: ownerGuard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    if (user.role !== 'MASTER_ADMIN' && user.barbershopId !== id) return reply.code(403).send({ success: false, message: 'Acesso negado' });
    const onboarding = await prisma.barbershopOnboarding.update({ where: { barbershopId: id }, data: { dismissedAt: null } });
    return reply.send({ success: true, data: onboarding });
  });
}
