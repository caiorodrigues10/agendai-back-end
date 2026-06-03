import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { updateServiceSchema } from "../../schemas/serviceSchemas";
import { UpdateServiceUseCase } from "./UpdateServiceUseCase";

export class UpdateServiceController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const data = updateServiceSchema.parse(request.body);
    const useCase = container.resolve(UpdateServiceUseCase);
    const updated = await useCase.execute(id, data);
    reply.send({ success: true, data: updated });
  }
}
