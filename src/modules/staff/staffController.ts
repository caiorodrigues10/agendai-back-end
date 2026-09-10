import { FastifyRequest, FastifyReply } from "fastify";
import {
  upsertScheduleSchema,
  assignServiceSchema,
  requestTimeOffSchema,
  timeOffQuerySchema,
} from "./staffSchema";
import { StaffUseCases } from "./staffUseCases";
import { AppError } from "@/shared/errors/AppError";

export class StaffController {
  private useCases = new StaffUseCases();

  // ─── Schedules ────────────────────────────────────────────────
  async listSchedules(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const { staffId } = request.query as { staffId?: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const schedules = await this.useCases.listSchedules(resolvedBarbershopId, staffId);
    reply.send({ success: true, data: schedules });
  }

  async upsertSchedule(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = upsertScheduleSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const schedule = await this.useCases.upsertSchedule(resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: schedule });
  }

  async deleteSchedule(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, scheduleId } = request.params as {
      barbershopId: string;
      scheduleId: string;
    };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.deleteSchedule(scheduleId, resolvedBarbershopId);
    reply.send({ success: true, message: "Agenda removida" });
  }

  // ─── Services ─────────────────────────────────────────────────
  async listServices(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const { staffId } = request.query as { staffId?: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const services = await this.useCases.listServices(resolvedBarbershopId, staffId);
    reply.send({ success: true, data: services });
  }

  async assignService(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = assignServiceSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const service = await this.useCases.assignService(resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: service });
  }

  async removeService(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, staffId, serviceId } = request.params as {
      barbershopId: string;
      staffId: string;
      serviceId: string;
    };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.removeService(resolvedBarbershopId, staffId, serviceId);
    reply.send({ success: true, message: "Serviço removido do funcionário" });
  }

  // ─── Time Off ─────────────────────────────────────────────────
  async listTimeOff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = timeOffQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const timeOffs = await this.useCases.listTimeOff(resolvedBarbershopId, query);
    reply.send({ success: true, data: timeOffs });
  }

  async requestTimeOff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = requestTimeOffSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const timeOff = await this.useCases.requestTimeOff(resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: timeOff });
  }

  async approveTimeOff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const timeOff = await this.useCases.approveTimeOff(id, resolvedBarbershopId, user.id);
    reply.send({ success: true, data: timeOff });
  }

  async rejectTimeOff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const timeOff = await this.useCases.rejectTimeOff(id, resolvedBarbershopId);
    reply.send({ success: true, data: timeOff });
  }
}
