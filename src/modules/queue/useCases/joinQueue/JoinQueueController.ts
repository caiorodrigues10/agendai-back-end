import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { JoinQueueUseCase } from "./JoinQueueUseCase";
import { z } from "zod";

export class JoinQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const schema = z.object({
      barbershopId: z.string().uuid(),
      serviceId: z.string().uuid(),
      customerId: z.string(),
      customerName: z.string(),
      whatsapp: z.string(),
      addedByStaff: z.boolean().optional()
    });

    const data = schema.parse(request.body);
    const useCase = container.resolve(JoinQueueUseCase);
    const item = await useCase.execute(data);
    return reply.status(201).send(item);
  }
}
