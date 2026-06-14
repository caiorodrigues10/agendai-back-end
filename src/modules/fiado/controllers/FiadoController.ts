import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import {
  CreateFiadoUseCase,
  GetFiadoUseCase,
  ListFiadosUseCase,
  UpdateFiadoUseCase,
  DeleteFiadoUseCase,
  AddFiadoPaymentUseCase,
  GetFiadoSummaryUseCase,
} from "../useCases/fiadoUseCases";
import {
  createFiadoSchema,
  updateFiadoSchema,
  createFiadoPaymentSchema,
  listFiadoQuerySchema,
} from "../schemas/fiadoSchemas";
import { AppError } from "@/shared/errors/AppError";

export class FiadoController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createFiadoSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.body as any).barbershopId
        : user.barbershopId;

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(CreateFiadoUseCase);
    const fiado = await useCase.execute(
      {
        ...body,
        barbershopId,
        createdById: user.id,
      },
      user
    );

    reply.status(201).send({ success: true, data: fiado });
  }

  async get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const useCase = container.resolve(GetFiadoUseCase);
    const fiado = await useCase.execute(id, user);

    reply.send({ success: true, data: fiado });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listFiadoQuerySchema.parse(request.query);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.query as any).barbershopId ?? "")
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(ListFiadosUseCase);
    const result = await useCase.execute({ ...query, barbershopId }, user);

    reply.send({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(result.total / query.limit),
      },
    });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = updateFiadoSchema.parse(request.body);

    const useCase = container.resolve(UpdateFiadoUseCase);
    const fiado = await useCase.execute(id, body, user);

    reply.send({ success: true, data: fiado });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const useCase = container.resolve(DeleteFiadoUseCase);
    await useCase.execute(id, user);

    reply.status(204).send();
  }

  async addPayment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id: fiadoId } = request.params as { id: string };
    const body = createFiadoPaymentSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.body as any).barbershopId
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(AddFiadoPaymentUseCase);
    const payment = await useCase.execute(
      {
        ...body,
        fiadoId,
        barbershopId,
        registeredById: user.id,
      },
      user
    );

    reply.status(201).send({ success: true, data: payment });
  }

  async summary(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.query as any).barbershopId ?? "")
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(GetFiadoSummaryUseCase);
    const summary = await useCase.execute(barbershopId, user);

    reply.send({ success: true, data: summary });
  }
}
