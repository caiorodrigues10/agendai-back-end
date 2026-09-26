import { FastifyRequest, FastifyReply } from "fastify";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  attachBarbershopSchema,
} from "./organizationSchema";
import { OrganizationUseCases } from "./organizationUseCases";
import { GetOrganizationDashboardUseCase } from "./useCases/getOrganizationDashboard/GetOrganizationDashboardUseCase";

export class OrganizationController {
  private useCases = new OrganizationUseCases();
  private dashboard = new GetOrganizationDashboardUseCase();

  async create(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const body = createOrganizationSchema.parse(request.body);
    const org = await this.useCases.create(user.id, body);
    reply.status(201).send({ success: true, data: org });
  }

  async listMy(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const orgs = await this.useCases.listMy(user.id);
    reply.send({ success: true, data: orgs });
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const org = await this.useCases.getById(id, user.id);
    reply.send({ success: true, data: org });
  }

  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const data = await this.dashboard.execute(id, user.id, user.role, user.barbershopId);
    reply.send({ success: true, data });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = updateOrganizationSchema.parse(request.body);
    const org = await this.useCases.update(id, user.id, body);
    reply.send({ success: true, data: org });
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id } = request.params as { id: string };
    await this.useCases.delete(id, user.id);
    reply.send({ success: true, message: "Organização excluída" });
  }

  async inviteMember(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = inviteMemberSchema.parse(request.body);
    const member = await this.useCases.inviteMember(id, user.id, body);
    reply.status(201).send({ success: true, data: member });
  }

  async listMembers(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const members = await this.useCases.listMembers(id, user.id);
    reply.send({ success: true, data: members });
  }

  async updateMemberRole(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id, memberId } = request.params as { id: string; memberId: string };
    const body = updateMemberRoleSchema.parse(request.body);
    const member = await this.useCases.updateMemberRole(id, memberId, user.id, body);
    reply.send({ success: true, data: member });
  }

  async removeMember(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id, memberId } = request.params as { id: string; memberId: string };
    await this.useCases.removeMember(id, memberId, user.id);
    reply.send({ success: true, message: "Membro removido" });
  }

  async attachBarbershop(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = attachBarbershopSchema.parse(request.body);
    const shop = await this.useCases.attachBarbershop(
      id,
      user.id,
      user.role,
      user.barbershopId,
      body.barbershopId
    );
    reply.status(201).send({ success: true, data: shop });
  }

  async detachBarbershop(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id, barbershopId } = request.params as { id: string; barbershopId: string };
    const shop = await this.useCases.detachBarbershop(id, user.id, user.role, barbershopId);
    reply.send({ success: true, data: shop });
  }

  async listAvailableBarbershops(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const shops = await this.useCases.listAvailableBarbershops(id, user.id, user.role);
    reply.send({ success: true, data: shops });
  }
}
