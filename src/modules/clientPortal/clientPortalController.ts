import { FastifyRequest, FastifyReply } from "fastify";
import {
  requestOtpSchema,
  verifyOtpSchema,
  requestLinkSchema,
  confirmLinkSchema,
  rejectLinkSchema,
  createCareTemplateSchema,
  updateCareTemplateSchema,
  sendCareInstructionSchema,
  clientPortalQuerySchema,
  barbershopIdQuerySchema,
  staffDashboardQuerySchema,
  linkIdParamsSchema,
} from "./clientPortalSchema";
import { ClientPortalRepositoryInstance } from "./clientPortalUseCases";
import { AppError } from "@/shared/errors/AppError";

export class ClientPortalController {
  private useCases = new ClientPortalRepositoryInstance();

  // ─── OTP Auth ────────────────────────────────────────────────
  async requestOtp(request: FastifyRequest, reply: FastifyReply) {
    const body = requestOtpSchema.parse(request.body);
    const ip = request.ip;
    const result = await this.useCases.requestOtp(body.phone, body.name ?? "Cliente", ip);

    reply.send({
      success: true,
      data: {
        expiresAt: result.expiresAt,
        identityId: result.identityId,
      },
    });
  }

  async verifyOtp(request: FastifyRequest, reply: FastifyReply) {
    const body = verifyOtpSchema.parse(request.body);
    const result = await this.useCases.verifyOtp(body.phone, body.code);

    reply.send({ success: true, data: result });
  }

  async refreshSession(request: FastifyRequest, reply: FastifyReply) {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (!refreshToken) throw new AppError("refreshToken é obrigatório", 400);

    const result = await this.useCases.refreshSession(refreshToken);
    reply.send({ success: true, data: result });
  }

  // ─── Salon Links ─────────────────────────────────────────────
  async requestLink(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const body = requestLinkSchema.parse(request.body);
    const link = await this.useCases.requestLink(
      identityId,
      body.barbershopId,
      body.salonClientId
    );

    reply.status(201).send({ success: true, data: link });
  }

  async confirmLink(request: FastifyRequest, reply: FastifyReply) {
    const { linkId, barbershopId } = request.params as { linkId: string; barbershopId: string };
    const body = confirmLinkSchema.parse(request.body ?? {});
    const user = request.user!;

    const link = await this.useCases.confirmLink(
      linkId,
      barbershopId,
      body.confirmedById ?? user.id
    );

    reply.send({ success: true, data: link });
  }

  async rejectLink(request: FastifyRequest, reply: FastifyReply) {
    const { linkId, barbershopId } = request.params as { linkId: string; barbershopId: string };
    const body = rejectLinkSchema.parse(request.body ?? {});
    const user = request.user!;

    const link = await this.useCases.rejectLink(
      linkId,
      barbershopId,
      body.rejectedById ?? user.id,
      body.reason
    );

    reply.send({ success: true, data: link });
  }

  async revokeLink(request: FastifyRequest, reply: FastifyReply) {
    const { linkId, barbershopId } = request.params as { linkId: string; barbershopId: string };
    const link = await this.useCases.revokeLink(linkId, barbershopId);
    reply.send({ success: true, data: link });
  }

  async listPendingLinks(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const links = await this.useCases.listPendingLinks(barbershopId);
    reply.send({ success: true, data: links });
  }

  async listAllLinks(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const links = await this.useCases.listAllLinks(barbershopId);
    reply.send({ success: true, data: links });
  }

  async listMyLinks(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const links = await this.useCases.listMyLinks(identityId);
    reply.send({ success: true, data: links });
  }

  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const identity = await this.useCases.getMe(identityId);
    reply.send({ success: true, data: identity });
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const sessionId = user.sessionId;
    if (!sessionId) throw new AppError("Sessão não encontrada", 400);

    await this.useCases.logout(sessionId);
    reply.send({ success: true, message: "Sessão encerrada" });
  }

  async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    await this.useCases.logoutAll(identityId);
    reply.send({ success: true, message: "Todas as sessões foram encerradas" });
  }

  async revokeOwnLink(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const { linkId } = linkIdParamsSchema.parse(request.params);
    const link = await this.useCases.revokeOwnLink(identityId, linkId);
    reply.send({ success: true, data: link });
  }

  // ─── Care Templates ──────────────────────────────────────────
  async createCareTemplate(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const body = createCareTemplateSchema.parse(request.body);
    const template = await this.useCases.createCareTemplate(barbershopId, body);

    reply.status(201).send({ success: true, data: template });
  }

  async updateCareTemplate(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const { id } = request.params as { id: string };
    const body = updateCareTemplateSchema.parse(request.body);
    const template = await this.useCases.updateCareTemplate(id, barbershopId, body);

    reply.send({ success: true, data: template });
  }

  async listCareTemplates(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const templates = await this.useCases.listCareTemplates(barbershopId);
    reply.send({ success: true, data: templates });
  }

  async deleteCareTemplate(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const { id } = request.params as { id: string };
    await this.useCases.deleteCareTemplate(id, barbershopId);

    reply.send({ success: true, message: "Template removido" });
  }

  // ─── Care Instructions ───────────────────────────────────────
  async sendCareInstruction(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const body = sendCareInstructionSchema.parse(request.body);
    const instruction = await this.useCases.sendCareInstruction(barbershopId, {
      ...body,
      sentById: user.id,
    });

    reply.status(201).send({ success: true, data: instruction });
  }

  async listCareInstructions(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const query = clientPortalQuerySchema.parse(request.query);
    const instructions = await this.useCases.listCareInstructions(barbershopId);

    reply.send({ success: true, data: instructions });
  }

  async markCareInstructionRead(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const { id } = request.params as { id: string };
    await this.useCases.markCareInstructionRead(id, identityId);
    reply.send({ success: true, message: "Marcado como lido" });
  }

  async listMyCareInstructions(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const barbershopId = (request.query as any)?.barbershopId;
    const instructions = await this.useCases.listMyCareInstructions(
      identityId,
      barbershopId
    );

    reply.send({ success: true, data: instructions });
  }

  // ─── Portal Dashboard ────────────────────────────────────────
  async getMyPortalDashboard(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const query = barbershopIdQuerySchema.parse(request.query);
    const dashboard = await this.useCases.getPortalDashboard(
      query.barbershopId,
      identityId
    );

    reply.send({ success: true, data: dashboard });
  }

  async getMyPortalHistory(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const { barbershopId } = request.query as { barbershopId?: string };
    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);

    const page = Math.max(1, parseInt((request.query as any)?.page ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt((request.query as any)?.limit ?? "20", 10)));

    const history = await this.useCases.getPortalHistory(barbershopId, identityId, page, limit);
    reply.send({ success: true, data: history });
  }

  async getStaffPortalDashboard(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { barbershopId: paramBarbershopId } = request.params as { barbershopId: string };
    const barbershopId = user.barbershopId ?? paramBarbershopId;
    if (!barbershopId) throw new AppError("barbershopId required", 400);

    const query = staffDashboardQuerySchema.parse(request.query);
    const dashboard = await this.useCases.getPortalDashboard(
      barbershopId,
      query.identityId
    );

    reply.send({ success: true, data: dashboard });
  }
}
