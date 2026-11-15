import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ZodError } from "zod";
import { AppError } from "@/shared/errors/AppError";
import { buildPaginationMeta } from "@/shared/utils/pagination";
import { resolveBarbershopId } from "@/shared/utils/barbershopScope";
import { appErrorFromZod } from "@/shared/utils/zodValidation";
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
import type { AddonSelectionItem } from "@/modules/addons";

/**
 * Lê `addonIds` (csv) e `addonQuantities` (csv alinhado) da query de slots —
 * FASE 3. Sem `addonIds` devolve `undefined` (fluxo idêntico ao de hoje).
 * A validação de domínio (limite, qty, vínculo) acontece no use case.
 */
function parseSlotsAddonParams(
  addonIds?: string,
  addonQuantities?: string
): AddonSelectionItem[] | undefined {
  if (addonQuantities && !addonIds) {
    throw new AppError("addonQuantities exige addonIds", 400);
  }
  if (!addonIds) return undefined;
  const ids = addonIds
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.length === 0) return undefined;
  const quantities = (addonQuantities ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (quantities.length > 0 && quantities.length !== ids.length) {
    throw new AppError(
      "addonQuantities deve ter o mesmo número de itens que addonIds",
      400
    );
  }
  return ids.map((addonId, index) => ({
    addonId,
    quantity: quantities[index] ? Number(quantities[index]) : 1,
  }));
}

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

    const barbershopId = resolveBarbershopId(
      user,
      (request.query as { barbershopId?: string }).barbershopId ?? null,
    );

    const useCase = container.resolve(ListAppointmentsUseCase);
    const result = await useCase.execute(barbershopId, query, user);

    reply.send({
      success: true,
      data: result.data,
      meta: buildPaginationMeta(result.total, query.page, query.limit),
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
        throw appErrorFromZod(
          error,
          "Parâmetros inválidos: informe barbershopId e date (YYYY-MM-DD)",
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
    let query: {
      barbershopId: string;
      date: string;
      serviceId: string;
      staffId?: string;
      addonIds?: string;
      addonQuantities?: string;
    };
    try {
      query = slotsQuerySchema.parse(request.query);
    } catch (error) {
      if (error instanceof ZodError) {
        throw appErrorFromZod(
          error,
          "Parâmetros inválidos: informe barbershopId, serviceId e date (YYYY-MM-DD)",
        );
      }
      throw error;
    }
    const addons = parseSlotsAddonParams(query.addonIds, query.addonQuantities);
    const slots = await new GetAvailableSlotsUseCase().execute(
      query.barbershopId,
      query.serviceId,
      query.date,
      query.staffId,
      addons
    );
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
    // Dados de caso/processo são internos: nunca voltam para o cliente.
    const { caseId: _caseId, caseName: _caseName, practiceArea: _practiceArea, ...publicAppointment } = appointment;
    reply.status(201).send({
      success: true,
      data: {
        ...publicAppointment,
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
