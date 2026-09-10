import { FastifyRequest, FastifyReply } from "fastify";
import {
  createProtocolSchema,
  updateProtocolSchema,
  runAuditSchema,
  qualityOverviewQuerySchema,
} from "./qualitySchema";
import { QualityUseCases } from "./qualityUseCases";
import { AppError } from "@/shared/errors/AppError";

export class QualityController {
  private useCases = new QualityUseCases();

  async listProtocols(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const protocols = await this.useCases.listProtocols(resolvedBarbershopId);
    reply.send({ success: true, data: protocols });
  }

  async createProtocol(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createProtocolSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId ?? (request.params as any).barbershopId
        : user.barbershopId ?? (request.params as any).barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const protocol = await this.useCases.createProtocol(resolvedBarbershopId, { ...body, barbershopId: resolvedBarbershopId });
    reply.status(201).send({ success: true, data: protocol });
  }

  async updateProtocol(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = updateProtocolSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const protocol = await this.useCases.updateProtocol(id, resolvedBarbershopId, body);
    reply.send({ success: true, data: protocol });
  }

  async deleteProtocol(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.deleteProtocol(id, resolvedBarbershopId);
    reply.send({ success: true, message: "Protocolo removido" });
  }

  async runAudit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = runAuditSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const audit = await this.useCases.runAudit(resolvedBarbershopId, {
      ...body,
      protocolId: id,
      barbershopId: resolvedBarbershopId,
    });
    reply.status(201).send({ success: true, data: audit });
  }

  async listAudits(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const audits = await this.useCases.listAudits(id, resolvedBarbershopId);
    reply.send({ success: true, data: audits });
  }

  async getOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = qualityOverviewQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const overview = await this.useCases.getOverview(resolvedBarbershopId, query);
    reply.send({ success: true, data: overview });
  }
}
