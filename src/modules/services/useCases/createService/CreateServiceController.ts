import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { createServiceSchema } from "../../schemas/serviceSchemas";
import { CreateServiceUseCase } from "./CreateServiceUseCase";
import { assertCategoryAccess } from "../catalog/ServiceCatalogController";
import { AppError } from "@/shared/errors/AppError";

export class CreateServiceController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = createServiceSchema.parse(request.body);
    const user = request.user!;
    const barbershopId = user.role === "MASTER_ADMIN" ? parsed.barbershopId : user.barbershopId;
    if (!barbershopId) throw new AppError("Barbearia não encontrada", 400);
    await assertCategoryAccess(parsed.categoryId, barbershopId);
    const data = { ...parsed, barbershopId };
    const useCase = container.resolve(CreateServiceUseCase);
    const service = await useCase.execute(data);
    reply.status(201).send({ success: true, data: service });
  }
}
