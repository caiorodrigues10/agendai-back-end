import { FastifyRequest, FastifyReply } from "fastify";
import {
  createEquipmentSchema,
  updateEquipmentSchema,
  equipmentListQuerySchema,
  createMovementSchema,
  movementListQuerySchema,
  createNeedSchema,
  updateNeedSchema,
  needListQuerySchema,
  dashboardQuerySchema,
} from "./equipmentSchema";
import { EquipmentUseCases } from "./equipmentUseCases";
import { AppError } from "@/shared/errors/AppError";

export class EquipmentController {
  private useCases = new EquipmentUseCases();

  // ─── Equipment CRUD ──────────────────────────────────────

  async listEquipment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = equipmentListQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const items = await this.useCases.listEquipment(resolvedBarbershopId, query);
    reply.send({ success: true, data: items });
  }

  async getEquipment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const item = await this.useCases.getEquipment(id, resolvedBarbershopId);
    reply.send({ success: true, data: item });
  }

  async createEquipment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createEquipmentSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const item = await this.useCases.createEquipment(resolvedBarbershopId, {
      ...body,
      barbershopId: resolvedBarbershopId,
    });
    reply.status(201).send({ success: true, data: item });
  }

  async updateEquipment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = updateEquipmentSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const item = await this.useCases.updateEquipment(id, resolvedBarbershopId, body);
    reply.send({ success: true, data: item });
  }

  async deleteEquipment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.deleteEquipment(id, resolvedBarbershopId);
    reply.send({ success: true, message: "Equipamento removido" });
  }

  // ─── Movements ───────────────────────────────────────────

  async listMovements(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = movementListQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const items = await this.useCases.listMovements(resolvedBarbershopId, query);
    reply.send({ success: true, data: items });
  }

  async createMovement(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createMovementSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const item = await this.useCases.createMovement(
      resolvedBarbershopId,
      { ...body, barbershopId: resolvedBarbershopId },
      user.id
    );
    reply.status(201).send({ success: true, data: item });
  }

  // ─── Needs ───────────────────────────────────────────────

  async listNeeds(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = needListQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const items = await this.useCases.listNeeds(resolvedBarbershopId, query);
    reply.send({ success: true, data: items });
  }

  async createNeed(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createNeedSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const item = await this.useCases.createNeed(resolvedBarbershopId, {
      ...body,
      barbershopId: resolvedBarbershopId,
      requestedBy: user.id,
    });
    reply.status(201).send({ success: true, data: item });
  }

  async updateNeed(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, needId } = request.params as { barbershopId: string; needId: string };
    const body = updateNeedSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const item = await this.useCases.updateNeed(needId, resolvedBarbershopId, body);
    reply.send({ success: true, data: item });
  }

  // ─── Dashboard ───────────────────────────────────────────

  async getDashboard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = dashboardQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;
    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const data = await this.useCases.getDashboard(resolvedBarbershopId, query);
    reply.send({ success: true, data });
  }
}
