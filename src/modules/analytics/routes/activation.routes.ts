import { FastifyInstance } from 'fastify';
import { authenticate } from '@/shared/infra/http/middlewares/authenticate';
import { authorize } from '@/shared/infra/http/middlewares/authorize';
import { setRlsContext } from '@/shared/infra/http/middlewares/setRlsContext';
import { ActivationController } from '../useCases/activation/ActivationController';
import { container } from 'tsyringe';

export async function activationRoutes(app: FastifyInstance) {
  const controller = container.resolve(ActivationController);

  // Authenticated — onboarding events must belong to the caller's shop
  app.post(
    '/analytics/activation',
    { preHandler: [authenticate, authorize(['OWNER', 'MASTER_ADMIN']), setRlsContext] },
    async (request, reply) => {
      await controller.record(request, reply);
    },
  );

  // Authenticated endpoint - list metrics for a barbershop (OWNER only)
  app.get(
    '/barbershops/:id/activation-metrics',
    { preHandler: [authenticate, authorize(['OWNER', 'MASTER_ADMIN']), setRlsContext] },
    async (request, reply) => {
      await controller.list(request, reply);
    },
  );
}
