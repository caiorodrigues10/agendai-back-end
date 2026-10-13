import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  CreateClientVehicleUseCase,
  ListClientVehiclesUseCase,
  UpdateClientVehicleUseCase,
  DeleteClientVehicleUseCase,
} from "../useCases/vehicles/vehicleUseCases";
import { createVehicleSchema, updateVehicleSchema } from "../schemas/vehicleSchemas";

export class VehicleController {
  async create(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateClientVehicleUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId?: string };
    const body = createVehicleSchema.parse(req.body);

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const vehicle = await useCase.execute(
      { ...body, barbershopId, clientId },
      req.user as { role: string; barbershopId?: string }
    );

    return reply.status(201).send({ success: true, data: vehicle });
  }

  async list(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListClientVehiclesUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId?: string };

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const vehicles = await useCase.execute(
      barbershopId,
      clientId,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.send({ success: true, data: vehicles });
  }

  async update(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateClientVehicleUseCase);
    const { id: clientId, vehicleId } = req.params as { id: string; vehicleId: string };
    const { barbershopId } = req.user as { barbershopId?: string };
    const body = updateVehicleSchema.parse(req.body);

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const vehicle = await useCase.execute(
      vehicleId,
      barbershopId,
      body,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.send({ success: true, data: vehicle });
  }

  async delete(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteClientVehicleUseCase);
    const { id: clientId, vehicleId } = req.params as { id: string; vehicleId: string };
    const { barbershopId } = req.user as { barbershopId?: string };

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    await useCase.execute(
      vehicleId,
      barbershopId,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.status(204).send();
  }
}
