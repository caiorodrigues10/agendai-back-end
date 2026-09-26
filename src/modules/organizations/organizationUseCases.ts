import { OrganizationRepository } from "./organizationRepository";
import { AppError } from "@/shared/errors/AppError";

export class OrganizationUseCases {
  private repo = new OrganizationRepository();

  async create(ownerId: string, data: { name: string; slug: string; logoUrl?: string }) {
    const existing = await this.repo.findBySlug(data.slug);
    if (existing) throw new AppError("Slug já está em uso", 409);
    return this.repo.create(ownerId, data);
  }

  async listMy(userId: string) {
    return this.repo.listByUser(userId);
  }

  async getById(id: string, userId: string) {
    const org = await this.repo.findById(id);
    if (!org) throw new AppError("Organização não encontrada", 404);

    const isMember = org.ownerId === userId || org.members.some((m: any) => m.userId === userId);
    if (!isMember) throw new AppError("Sem acesso a esta organização", 403);

    return org;
  }

  async update(id: string, userId: string, data: { name?: string; slug?: string; logoUrl?: string | null }) {
    const org = await this.repo.findById(id);
    if (!org) throw new AppError("Organização não encontrada", 404);

    const member = await this.repo.getMember(id, userId);
    if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
      throw new AppError("Sem permissão para editar", 403);
    }

    if (data.slug && data.slug !== org.slug) {
      const existing = await this.repo.findBySlug(data.slug);
      if (existing) throw new AppError("Slug já está em uso", 409);
    }

    return this.repo.update(id, data);
  }

  async delete(id: string, userId: string) {
    const org = await this.repo.findById(id);
    if (!org) throw new AppError("Organização não encontrada", 404);
    if (org.ownerId !== userId) throw new AppError("Apenas o proprietário pode excluir", 403);
    return this.repo.delete(id);
  }

  async inviteMember(orgId: string, userId: string, data: { userId: string; role: string }) {
    const org = await this.repo.findById(orgId);
    if (!org) throw new AppError("Organização não encontrada", 404);

    const requester = await this.repo.getMember(orgId, userId);
    if (!requester || !["OWNER", "ADMIN"].includes(requester.role)) {
      throw new AppError("Sem permissão para convidar", 403);
    }

    const existing = await this.repo.getMember(orgId, data.userId);
    if (existing) throw new AppError("Usuário já é membro", 409);

    return this.repo.addMember(orgId, data.userId, data.role);
  }

  async listMembers(orgId: string, userId: string) {
    const org = await this.repo.findById(orgId);
    if (!org) throw new AppError("Organização não encontrada", 404);

    const isMember = org.ownerId === userId || org.members.some((m: any) => m.userId === userId);
    if (!isMember) throw new AppError("Sem acesso", 403);

    return this.repo.listMembers(orgId);
  }

  async updateMemberRole(orgId: string, memberId: string, userId: string, data: { role: string }) {
    const requester = await this.repo.getMember(orgId, userId);
    if (!requester || !["OWNER", "ADMIN"].includes(requester.role)) {
      throw new AppError("Sem permissão", 403);
    }

    const member = await this.repo.listMembers(orgId);
    const target = member.find((m: any) => m.id === memberId);
    if (!target) throw new AppError("Membro não encontrado", 404);

    if (target.userId === userId && data.role !== "OWNER") {
      throw new AppError("Proprietário não pode ser rebaixado", 403);
    }

    return this.repo.updateMemberRole(memberId, data.role);
  }

  async removeMember(orgId: string, memberId: string, userId: string) {
    const requester = await this.repo.getMember(orgId, userId);
    if (!requester || !["OWNER", "ADMIN"].includes(requester.role)) {
      throw new AppError("Sem permissão", 403);
    }

    const members = await this.repo.listMembers(orgId);
    const target = members.find((m: any) => m.id === memberId);
    if (!target) throw new AppError("Membro não encontrado", 404);

    if (target.userId === userId) {
      throw new AppError("Proprietário não pode se remover", 403);
    }

    return this.repo.removeMember(memberId);
  }

  private async assertCanManageBarbershops(orgId: string, userId: string, userRole: string) {
    const org = await this.repo.findById(orgId);
    if (!org) throw new AppError("Organização não encontrada", 404);

    if (userRole === "MASTER_ADMIN") return org;

    const member = await this.repo.getMember(orgId, userId);
    if ((!member || !["OWNER", "ADMIN"].includes(member.role)) && org.ownerId !== userId) {
      throw new AppError("Sem permissão para gerenciar salões", 403);
    }

    return org;
  }

  async attachBarbershop(
    orgId: string,
    userId: string,
    userRole: string,
    userBarbershopId: string | undefined,
    requestedBarbershopId?: string
  ) {
    await this.assertCanManageBarbershops(orgId, userId, userRole);

    let barbershopId: string;
    if (userRole === "MASTER_ADMIN") {
      if (!requestedBarbershopId) {
        throw new AppError("Informe o barbershopId para vincular", 400);
      }
      barbershopId = requestedBarbershopId;
    } else {
      if (!userBarbershopId) {
        throw new AppError("Sua conta não está vinculada a nenhum salão", 400);
      }
      // Dono comum só pode anexar o salão da própria sessão — nunca um id arbitrário do body.
      if (requestedBarbershopId && requestedBarbershopId !== userBarbershopId) {
        throw new AppError("Você só pode vincular o salão da sua própria conta", 403);
      }
      barbershopId = userBarbershopId;
    }

    const shop = await this.repo.findBarbershopById(barbershopId);
    if (!shop) throw new AppError("Barbearia não encontrada", 404);

    if (userRole !== "MASTER_ADMIN") {
      // Confirma o papel de OWNER nessa conta (não é mais uma busca cross-conta).
      const requester = await this.repo.getRequesterAsBarbershopOwner(userId, barbershopId);
      if (!requester) throw new AppError("Apenas o OWNER do salão pode vinculá-lo", 403);
    }

    if (shop.organizationId) {
      throw new AppError("Barbearia já está vinculada a uma organização", 409);
    }

    return this.repo.attachBarbershop(orgId, barbershopId);
  }

  async detachBarbershop(orgId: string, userId: string, userRole: string, barbershopId: string) {
    await this.assertCanManageBarbershops(orgId, userId, userRole);

    const shop = await this.repo.findBarbershopById(barbershopId);
    if (!shop) throw new AppError("Barbearia não encontrada", 404);
    if (shop.organizationId !== orgId) {
      throw new AppError("Barbearia não está vinculada a esta organização", 404);
    }

    return this.repo.detachBarbershop(barbershopId);
  }

  async listAvailableBarbershops(orgId: string, userId: string, userRole: string) {
    await this.assertCanManageBarbershops(orgId, userId, userRole);
    return this.repo.listAvailableBarbershops(userRole === "MASTER_ADMIN" ? null : userId);
  }
}
