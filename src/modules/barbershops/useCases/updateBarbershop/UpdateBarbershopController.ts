import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { updateBarbershopSchema } from "../../schemas/barbershopSchemas";
import { UpdateBarbershopUseCase } from "./UpdateBarbershopUseCase";

export class UpdateBarbershopController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const data = updateBarbershopSchema.parse(request.body);
    const useCase = container.resolve(UpdateBarbershopUseCase);
    const updated = await useCase.execute(id, data);
    reply.send({ success: true, data: updated });
  }
}
