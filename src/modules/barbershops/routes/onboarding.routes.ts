import { FastifyInstance } from 'fastify';
import { authenticate } from '@/shared/infra/http/middlewares/authenticate';
import { authorize } from '@/shared/infra/http/middlewares/authorize';
import { GetOnboardingUseCase } from '../useCases/onboarding/GetOnboardingUseCase';
import { UpdateOnboardingStepUseCase } from '../useCases/onboarding/UpdateOnboardingStepUseCase';
import { container } from 'tsyringe';

export async function onboardingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', authorize(['OWNER', 'MASTER_ADMIN']));

  app.get('/barbershops/:id/onboarding', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    const useCase = container.resolve(GetOnboardingUseCase);
    const result = await useCase.execute(id, user.id, user.role);
    reply.send({ success: true, data: result });
  });

  app.post('/barbershops/:id/onboarding/steps', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { step } = request.body as { step: string };
    const user = request.user!;
    const useCase = container.resolve(UpdateOnboardingStepUseCase);
    const result = await useCase.execute(id, step as never, user.role);
    reply.send({ success: true, data: result });
  });
}
