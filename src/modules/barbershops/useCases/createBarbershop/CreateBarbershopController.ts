import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { createBarbershopSchema } from "../../schemas/barbershopSchemas";
import { CreateBarbershopUseCase } from "./CreateBarbershopUseCase";

export class CreateBarbershopController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = createBarbershopSchema.parse(request.body);
    const useCase = container.resolve(CreateBarbershopUseCase);
    const barbershop = await useCase.execute(data);
    reply.status(201).send({ success: true, data: barbershop });
  }
}
