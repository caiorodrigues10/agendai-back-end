import { FastifyRequest, FastifyReply } from "fastify";
import {
  createShowcaseEntrySchema,
  updateShowcaseEntrySchema,
  showcaseOrderSchema,
  showcaseListQuerySchema,
  showcaseEventQuerySchema,
} from "./showcaseSchema";
import { ShowcaseUseCases } from "./showcaseUseCases";
import { AppError } from "@/shared/errors/AppError";

export class ShowcaseController {
  private useCases = new ShowcaseUseCases();

  async listPublic(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const entries = await this.useCases.listPublished(id);
    reply.send({ success: true, data: entries });
  }

  async getDetail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(entryId)) {
      throw new AppError("entryId inválido", 400);
    }
    const entry = await this.useCases.getPublishedById(id, entryId);
    reply.send({ success: true, data: entry });
  }

  async listStaff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = showcaseListQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const entries = await this.useCases.listStaff(resolvedBarbershopId, query);
    reply.send({ success: true, data: entries });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createShowcaseEntrySchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId ?? (request.params as any).barbershopId
        : user.barbershopId ?? (request.params as any).barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const entry = await this.useCases.create(resolvedBarbershopId, { ...body, barbershopId: resolvedBarbershopId });
    reply.status(201).send({ success: true, data: entry });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = updateShowcaseEntrySchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const entry = await this.useCases.update(id, resolvedBarbershopId, body);
    reply.send({ success: true, data: entry });
  }

  async publish(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const entry = await this.useCases.publish(id, resolvedBarbershopId);
    reply.send({ success: true, data: entry });
  }

  async hide(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const entry = await this.useCases.hide(id, resolvedBarbershopId);
    reply.send({ success: true, data: entry });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.delete(id, resolvedBarbershopId);
    reply.send({ success: true, message: "Showcase entry removido" });
  }

  async reorder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = showcaseOrderSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.reorder(resolvedBarbershopId, body);
    reply.send({ success: true, message: "Ordem atualizada" });
  }

  async recordEvent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, entryId } = request.params as { barbershopId: string; entryId: string };
    const body = (request.body ?? {}) as { eventType: string; metadata?: Record<string, unknown> };

    if (!body.eventType) throw new AppError("eventType is required", 400);

    const event = await this.useCases.recordEvent(entryId, barbershopId, body.eventType, body.metadata);
    reply.status(201).send({ success: true, data: event });
  }

  async getAnalytics(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = showcaseEventQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const analytics = await this.useCases.getAnalytics(resolvedBarbershopId, query);
    reply.send({ success: true, data: analytics });
  }
}
