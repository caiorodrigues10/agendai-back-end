import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  CreateSalonClientUseCase,
  DeleteSalonClientUseCase,
  GetSalonClientUseCase,
  ListSalonClientsUseCase,
  UpdateSalonClientUseCase,
} from "../useCases/clientUseCases";
import {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} from "../schemas/clientSchemas";

export class ClientController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createClientSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? body.barbershopId
        : user.barbershopId;

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(CreateSalonClientUseCase);
    const client = await useCase.execute({ ...body, barbershopId }, user);
    reply.status(201).send({ success: true, data: client });
  }

  async get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(GetSalonClientUseCase);
    const client = await useCase.execute(id, request.user!);
    reply.send({ success: true, data: client });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listClientsQuerySchema.parse(request.query);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.query as { barbershopId?: string }).barbershopId ?? "")
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(ListSalonClientsUseCase);
    const result = await useCase.execute({ ...query, barbershopId }, user);

    reply.send({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(result.total / query.limit) || 1,
      },
    });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = updateClientSchema.parse(request.body);
    const useCase = container.resolve(UpdateSalonClientUseCase);
    const client = await useCase.execute(id, body, request.user!);
    reply.send({ success: true, data: client });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(DeleteSalonClientUseCase);
    await useCase.execute(id, request.user!);
    reply.status(204).send();
  }
}
