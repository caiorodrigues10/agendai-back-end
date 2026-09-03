import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ZodError } from "zod";
import { AppError } from "@/shared/errors/AppError";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentsQuerySchema,
  availabilityQuerySchema,
} from "../schemas/appointmentSchemas";
import {
  CreateAppointmentUseCase,
  CreatePublicAppointmentUseCase,
  GetAppointmentUseCase,
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
  CancelAppointmentUseCase,
  GetAvailabilityUseCase,
  GetAvailableSlotsUseCase,
} from "../useCases/appointmentUseCases";
import { slotsQuerySchema } from "../schemas/appointmentSchemas";
import { PublicAppointmentManagementUseCase } from "../useCases/publicManagement/PublicAppointmentManagementUseCase";
import { createPublicAppointmentToken } from "../services/publicAppointmentToken";

export class AppointmentController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createAppointmentSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId
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

  /** Rota pública — retorna array de slots ocupados (formato esperado pelo front). */
  async availability(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    let query: { barbershopId: string; date: string; staffId?: string };
    try {
      query = availabilityQuerySchema.parse(request.query);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError(
          "Parâmetros inválidos: informe barbershopId e date (YYYY-MM-DD)",
          400,
          error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        );
      }
      throw error;
    }
    const useCase = container.resolve(GetAvailabilityUseCase);
    const slots = await useCase.execute(
      query.barbershopId,
      query.date,
      query.staffId
    );
    reply.send(slots);
  }

  async slots(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = slotsQuerySchema.parse(request.query);
    const slots = await new GetAvailableSlotsUseCase().execute(query.barbershopId, query.serviceId, query.date, query.staffId);
    reply.send({ success: true, data: slots });
  }

  async cancel(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(CancelAppointmentUseCase);
    await useCase.execute(id, request.user!);
    reply.status(204).send();
  }

  /** Rota pública — cria agendamento sem login e sem privilégio admin implícito. */
  async createPublic(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = createAppointmentSchema.parse(request.body);
    if (!body.barbershopId) throw new AppError("barbershopId é obrigatório", 400);
    const useCase = container.resolve(CreatePublicAppointmentUseCase);
    const appointment = await useCase.execute({
      ...body,
      barbershopId: body.barbershopId,
    });
    reply.status(201).send({
      success: true,
      data: {
        ...appointment,
        manageToken: createPublicAppointmentToken(appointment.id, appointment.barbershopId, 1),
      },
    });
  }

  async publicSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { token } = request.body as { token?: string };
    if (!token || token.length > 4096) throw new AppError("Link de agendamento inválido ou expirado", 401, undefined, "INVALID_APPOINTMENT_TOKEN");
    const result = await new PublicAppointmentManagementUseCase().exchange(token);
    reply.send({ success: true, data: result });
  }

  async publicManage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!session) throw new AppError("Sessão pública ausente", 401, undefined, "INVALID_APPOINTMENT_TOKEN");
    const appointment = await new PublicAppointmentManagementUseCase().get(session);
    reply.send({ success: true, data: appointment });
  }

  async publicCancel(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!session) throw new AppError("Sessão pública ausente", 401, undefined, "INVALID_APPOINTMENT_TOKEN");
    const body = (request.body ?? {}) as { reason?: string };
    const appointment = await new PublicAppointmentManagementUseCase().cancel(session, body.reason);
    reply.send({ success: true, data: appointment });
  }

  async publicReschedule(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!session) throw new AppError("Sessão pública ausente", 401, undefined, "INVALID_APPOINTMENT_TOKEN");
    const body = request.body as { date?: string; time?: string };
    if (!body?.date || !body?.time) throw new AppError("Informe a nova data e horário", 400);
    const result = await new PublicAppointmentManagementUseCase().reschedule(session, body.date, body.time);
    reply.send({ success: true, data: result });
  }
}
