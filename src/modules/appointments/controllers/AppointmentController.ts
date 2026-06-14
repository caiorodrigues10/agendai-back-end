import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentsQuerySchema,
} from "../schemas/appointmentSchemas";
import {
  CreateAppointmentUseCase,
  GetAppointmentUseCase,
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
  CancelAppointmentUseCase,
} from "../useCases/appointmentUseCases";

export class AppointmentController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createAppointmentSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.body as any).barbershopId
        : user.barbershopId;

    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);

    const useCase = container.resolve(CreateAppointmentUseCase);
    const appointment = await useCase.execute({ ...body, barbershopId }, user);

    reply.status(201).send({ success: true, data: appointment });
  }

  async get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(GetAppointmentUseCase);
    const appointment = await useCase.execute(id, request.user!);
    reply.send({ success: true, data: appointment });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listAppointmentsQuerySchema.parse(request.query);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.query as any).barbershopId ?? "")
        : user.barbershopId ?? "";

    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);

    const useCase = container.resolve(ListAppointmentsUseCase);
    const result = await useCase.execute(barbershopId, query, user);

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
    const { id } = request.params as { id: string };
    const data = updateAppointmentSchema.parse(request.body);
    const useCase = container.resolve(UpdateAppointmentUseCase);
    const appointment = await useCase.execute(id, data, request.user!);
    reply.send({ success: true, data: appointment });
  }

  async cancel(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(CancelAppointmentUseCase);
    await useCase.execute(id, request.user!);
    reply.status(204).send();
  }
}
