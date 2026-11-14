import { container } from "tsyringe";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AddonCatalogUseCases } from "../application/addonCatalogUseCases";
import {
  createSalonAddonSchema,
  listSalonAddonsQuerySchema,
  replaceServiceAddonLinksSchema,
  updateSalonAddonSchema,
} from "./addonCatalogSchemas";
import { AppError } from "@/shared/errors/AppError";
import { MESSAGES } from "@/shared/messages/pt-BR";

type BarbershopParams = { barbershopId: string };
type AddonParams = BarbershopParams & { id: string };
type ServiceParams = BarbershopParams & { serviceId: string };

/**
 * Presentation: só Zod + use cases via DI. Sem Prisma, sem regra de negócio.
 * `barbershopId` vem do contexto (`setRlsContext` + `assertTenantParam`).
 */
export class AddonCatalogController {
  private useCases(): AddonCatalogUseCases {
    return container.resolve(AddonCatalogUseCases);
  }

  private resolveBarbershopId(
    user: { role: string; barbershopId?: string },
    barbershopId?: string
  ): string {
    if (user.role === "MASTER_ADMIN") {
      if (!barbershopId) throw new AppError(MESSAGES.addons.barbershopRequired, 400);
      return barbershopId;
    }
    const resolved = user.barbershopId ?? barbershopId;
    if (!resolved) throw new AppError(MESSAGES.addons.barbershopRequired, 400);
    return resolved;
  }

  async listAddons(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as BarbershopParams;
    const query = listSalonAddonsQuerySchema.parse(request.query ?? {});
    const resolved = this.resolveBarbershopId(user, barbershopId);
    const data = await this.useCases().listAddons(resolved, {
      serviceId: query.serviceId,
      includeDeleted: query.includeDeleted,
    });
    reply.send({ success: true, data });
  }

  async getAddon(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as AddonParams;
    const resolved = this.resolveBarbershopId(user, barbershopId);
    const data = await this.useCases().getAddon(resolved, id);
    reply.send({ success: true, data });
  }

  async createAddon(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as BarbershopParams;
    const body = createSalonAddonSchema.parse(request.body);
    const resolved = this.resolveBarbershopId(user, barbershopId);
    const data = await this.useCases().createAddon(resolved, body);
    reply.status(201).send({ success: true, data });
  }

  async updateAddon(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as AddonParams;
    const body = updateSalonAddonSchema.parse(request.body);
    const resolved = this.resolveBarbershopId(user, barbershopId);
    const data = await this.useCases().updateAddon(resolved, id, body);
    reply.send({ success: true, data });
  }

  async deleteAddon(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as AddonParams;
    const resolved = this.resolveBarbershopId(user, barbershopId);
    await this.useCases().deleteAddon(resolved, id);
    reply.send({ success: true, message: "Adicional removido" });
  }

  async listServiceAddonLinks(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = request.user!;
    const { barbershopId, serviceId } = request.params as ServiceParams;
    const resolved = this.resolveBarbershopId(user, barbershopId);
    const data = await this.useCases().listServiceAddonLinks(resolved, serviceId);
    reply.send({ success: true, data });
  }

  async replaceServiceAddonLinks(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = request.user!;
    const { barbershopId, serviceId } = request.params as ServiceParams;
    const body = replaceServiceAddonLinksSchema.parse(request.body);
    const resolved = this.resolveBarbershopId(user, barbershopId);
    const data = await this.useCases().replaceServiceAddonLinks(
      resolved,
      serviceId,
      body.links
    );
    reply.send({ success: true, data });
  }
}
