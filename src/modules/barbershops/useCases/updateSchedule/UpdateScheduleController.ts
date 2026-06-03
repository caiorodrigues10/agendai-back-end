import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { updateScheduleSchema } from "../../schemas/barbershopSchemas";
import { UpdateScheduleUseCase } from "./UpdateScheduleUseCase";

export class UpdateScheduleController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const data = updateScheduleSchema.parse(request.body);
    const useCase = container.resolve(UpdateScheduleUseCase);
    const updated = await useCase.execute(id, data);
    reply.status(200).send({
      success: true,
      message: "Agenda atualizada com sucesso",
      data: updated
    });
  }
}
