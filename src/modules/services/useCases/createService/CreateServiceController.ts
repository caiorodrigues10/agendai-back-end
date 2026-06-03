import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { createServiceSchema } from "../../schemas/serviceSchemas";
import { CreateServiceUseCase } from "./CreateServiceUseCase";

export class CreateServiceController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = createServiceSchema.parse(request.body);
    const useCase = container.resolve(CreateServiceUseCase);
    const service = await useCase.execute(data);
    reply.status(201).send({ success: true, data: service });
  }
}
