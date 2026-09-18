import { FastifyRequest, FastifyReply } from 'fastify';
import { container } from 'tsyringe';
import { RecordActivationEventUseCase } from './RecordActivationEventUseCase';
import { ListActivationMetricsUseCase } from './ListActivationMetricsUseCase';
import { AppError } from '@/shared/errors/AppError';

export class ActivationController {
  async record(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, event, metadata } = request.body as {
      barbershopId: string;
      event: string;
      metadata?: Record<string, unknown>;
    };

    if (!barbershopId || !event) {
      throw new AppError('barbershopId e event são obrigatórios', 400);
    }
    if (user.role !== 'MASTER_ADMIN' && user.barbershopId !== barbershopId) {
      throw new AppError('Acesso negado', 403);
    }

    const useCase = container.resolve(RecordActivationEventUseCase);
    const result = await useCase.execute({ barbershopId, event, metadata });

    reply.status(201).send({ success: true, data: result });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const user = request.user!;

    if (user.role !== 'MASTER_ADMIN' && user.barbershopId !== id) {
      throw new AppError('Acesso negado', 403);
    }

    const useCase = container.resolve(ListActivationMetricsUseCase);
    const result = await useCase.execute(id);

    reply.send({ success: true, data: result });
  }
}
