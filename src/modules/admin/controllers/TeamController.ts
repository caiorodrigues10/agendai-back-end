import { FastifyRequest, FastifyReply } from "fastify";
import { InviteTeamMemberUseCase } from "../useCases/team/InviteTeamMemberUseCase";
import { ListTeamUseCase } from "../useCases/team/ListTeamUseCase";
import { DeactivateMemberUseCase } from "../useCases/team/DeactivateMemberUseCase";
import { ResendInvitationUseCase } from "../useCases/team/ResendInvitationUseCase";
import { RevokeInvitationUseCase } from "../useCases/team/RevokeInvitationUseCase";
import { AcceptInvitationUseCase } from "../useCases/team/AcceptInvitationUseCase";
import { inviteTeamMemberSchema, updateMemberStatusSchema, acceptInvitationSchema } from "../schemas/internalSchemas";
import { prisma } from "@/libs/prismaClient";

export class TeamController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const useCase = new ListTeamUseCase();
    const result = await useCase.execute({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
    });
    return reply.send({ success: true, ...result });
  }

  async invite(request: FastifyRequest, reply: FastifyReply) {
    const body = inviteTeamMemberSchema.parse(request.body);
    const userId = request.user!.id;
    const useCase = new InviteTeamMemberUseCase();
    const result = await useCase.execute({
      email: body.email,
      role: body.role,
      invitedById: userId,
    });
    return reply.status(201).send({ success: true, data: result.invitation });
  }

  async deactivate(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateMemberStatusSchema.parse(request.body);
    if (body.active) {
      return reply.send({ success: true, data: { alreadyActive: true } });
    }
    const useCase = new DeactivateMemberUseCase();
    const result = await useCase.execute({
      targetId: id,
      performedBy: request.user!.id,
    });
    return reply.send({ success: true, data: result });
  }

  async resendInvitation(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const useCase = new ResendInvitationUseCase();
    const result = await useCase.execute({
      invitationId: id,
      performedById: request.user!.id,
    });
    return reply.send({ success: true, data: result.invitation });
  }

  async revokeInvitation(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const useCase = new RevokeInvitationUseCase();
    const result = await useCase.execute({
      invitationId: id,
      performedById: request.user!.id,
    });
    return reply.send({ success: true, data: result });
  }

  async acceptInvitation(request: FastifyRequest, reply: FastifyReply) {
    const body = acceptInvitationSchema.parse(request.body);
    const useCase = new AcceptInvitationUseCase();
    const result = await useCase.execute({
      token: body.token,
      name: body.name,
      password: body.password,
    });
    return reply.status(201).send({ success: true, data: result });
  }

  async getInvitationInfo(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };
    const { createHash } = await import("node:crypto");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const invitation = await prisma.internalInvitation.findFirst({
      where: { tokenHash, status: "PENDING" },
      select: { id: true, email: true, expiresAt: true },
    });

    if (!invitation) {
      return reply.status(404).send({ success: false, error: "Convite não encontrado" });
    }

    if (new Date() > invitation.expiresAt) {
      return reply.status(410).send({ success: false, error: "Convite expirado" });
    }

    return reply.send({
      success: true,
      data: { email: invitation.email, expiresAt: invitation.expiresAt },
    });
  }
}
