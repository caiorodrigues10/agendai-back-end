import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  CreateClientPetUseCase,
  ListClientPetsUseCase,
  UpdateClientPetUseCase,
  DeleteClientPetUseCase,
} from "../useCases/pets/petUseCases";
import { createPetSchema, updatePetSchema } from "../schemas/petSchemas";

export class PetController {
  async create(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateClientPetUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId?: string };
    const body = createPetSchema.parse(req.body);

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const pet = await useCase.execute(
      { ...body, barbershopId, clientId },
      req.user as { role: string; barbershopId?: string }
    );

    return reply.status(201).send({ success: true, data: pet });
  }

  async list(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListClientPetsUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId?: string };

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const pets = await useCase.execute(
      barbershopId,
      clientId,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.send({ success: true, data: pets });
  }

  async update(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateClientPetUseCase);
    const { id: clientId, petId } = req.params as { id: string; petId: string };
    const { barbershopId } = req.user as { barbershopId?: string };
    const body = updatePetSchema.parse(req.body);

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const pet = await useCase.execute(
      petId,
      barbershopId,
      body,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.send({ success: true, data: pet });
  }

  async delete(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteClientPetUseCase);
    const { id: clientId, petId } = req.params as { id: string; petId: string };
    const { barbershopId } = req.user as { barbershopId?: string };

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    await useCase.execute(
      petId,
      barbershopId,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.status(204).send();
  }
}
