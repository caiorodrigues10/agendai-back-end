import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  CreateServicePackageUseCase,
  ListServicePackagesUseCase,
  UpdateServicePackageUseCase,
  SellClientPackageUseCase,
  ListClientPackagesUseCase,
  BookClientPackageUseCase,
  ConsumeClientPackageUseCase,
  CancelClientPackageUseCase,
} from "../useCases/packageUseCases";
import {
  createServicePackageSchema,
  updateServicePackageSchema,
  listServicePackagesQuerySchema,
  sellClientPackageSchema,
  listClientPackagesQuerySchema,
  bookClientPackageSchema,
} from "../schemas/packageSchemas";

function resolveBarbershopId(
  user: { role: string; barbershopId?: string },
  fallback?: string
): string {
  const barbershopId =
    user.role === "MASTER_ADMIN" ? fallback ?? "" : user.barbershopId ?? "";
  if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);
  return barbershopId;
}

export class ServicePackageController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createServicePackageSchema.parse(request.body);
    const barbershopId = resolveBarbershopId(
      user,
      body.barbershopId
    );
    const useCase = container.resolve(CreateServicePackageUseCase);
    const pkg = await useCase.execute({ ...body, barbershopId }, user);
    reply.status(201).send({ success: true, data: pkg });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listServicePackagesQuerySchema.parse(request.query);
    const barbershopId = resolveBarbershopId(
      user,
      (request.query as { barbershopId?: string }).barbershopId
    );
    const useCase = container.resolve(ListServicePackagesUseCase);
    const data = await useCase.execute(barbershopId, user, query.active);
    reply.send({ success: true, data });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = updateServicePackageSchema.parse(request.body);
    const useCase = container.resolve(UpdateServicePackageUseCase);
    const pkg = await useCase.execute(id, body, request.user!);
    reply.send({ success: true, data: pkg });
  }
}

export class ClientPackageController {
  async sell(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = sellClientPackageSchema.parse(request.body);
    const barbershopId = resolveBarbershopId(
      user,
      body.barbershopId
    );
    const useCase = container.resolve(SellClientPackageUseCase);
    const sold = await useCase.execute(
      { ...body, barbershopId, soldById: user.id },
      user
    );
    reply.status(201).send({ success: true, data: sold });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listClientPackagesQuerySchema.parse(request.query);
    const barbershopId = resolveBarbershopId(
      user,
      (request.query as { barbershopId?: string }).barbershopId
    );
    const useCase = container.resolve(ListClientPackagesUseCase);
    const data = await useCase.execute({ ...query, barbershopId }, user);
    reply.send({ success: true, data });
  }

  async book(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = bookClientPackageSchema.parse(request.body);
    const useCase = container.resolve(BookClientPackageUseCase);
    const appointments = await useCase.execute(id, body.slots, request.user!);
    reply.status(201).send({ success: true, data: appointments });
  }

  async consume(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(ConsumeClientPackageUseCase);
    const pkg = await useCase.execute(id, request.user!);
    reply.send({ success: true, data: pkg });
  }

  async cancel(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(CancelClientPackageUseCase);
    const pkg = await useCase.execute(id, request.user!);
    reply.send({ success: true, data: pkg });
  }
}
