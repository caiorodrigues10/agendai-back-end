import { FastifyRequest, FastifyReply } from 'fastify';
import { container } from 'tsyringe';
import { ChangeOperationModeUseCase } from './ChangeOperationModeUseCase';

export class ChangeOperationModeController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };
    const { operationMode } = request.body as { operationMode: string };

    const useCase = container.resolve(ChangeOperationModeUseCase);
    const result = await useCase.execute({
      barbershopId,
      operationMode: operationMode as any,
      requestingUser: request.user!,
    });

    reply.send({ success: true, data: result });
  }
}
