import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { updateBarbershopSchema } from "../../schemas/barbershopSchemas";
import { UpdateBarbershopUseCase } from "./UpdateBarbershopUseCase";

export class UpdateBarbershopController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const parsed = updateBarbershopSchema.parse(request.body);

    // Normaliza string vazia → null (= "sem instância própria, usar fallback").
    const data =
      "evolutionInstanceName" in parsed && parsed.evolutionInstanceName === ""
        ? { ...parsed, evolutionInstanceName: null }
        : parsed;

    const useCase = container.resolve(UpdateBarbershopUseCase);
    const updated = await useCase.execute(id, data);
    reply.send({ success: true, data: updated });
  }
}
