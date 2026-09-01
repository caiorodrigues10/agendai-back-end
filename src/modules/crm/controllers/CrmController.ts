import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { GetCrmClientUseCase, GetCrmForecastUseCase, GetCrmOverviewUseCase, ListCrmClientsUseCase, MergeCrmClientsUseCase, BackfillCrmUseCase, assertCrmAccess } from "../useCases/crmUseCases";
import { campaignSchema, crmClientsSchema, crmForecastSchema, crmPeriodSchema, mergeClientsSchema } from "../schemas/crmSchemas";
import { ICrmRepository } from "../repositories/ICrmRepository";

function resolveShop(request: FastifyRequest, supplied?: string): string {
  const user = request.user!;
  const barbershopId = user.role === "MASTER_ADMIN" ? supplied : user.barbershopId;
  if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);
  return barbershopId;
}

async function resolveCampaignClientIds(shop: string, segment: string, requested?: string[]): Promise<string[] | undefined> {
  if (requested) return requested;
  if (segment === "all") return undefined;
  const repo = container.resolve<ICrmRepository>("CrmRepository");
  const result = await repo.listClients(shop, { page: 1, limit: 5000, segment: segment as any });
  return result.data.map((client) => client.clientId);
}

export class CrmController {
  async overview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = crmPeriodSchema.parse(request.query); const shop = resolveShop(request, query.barbershopId);
    const to = query.to ?? new Date(); const from = query.from ?? new Date(to.getTime() - 30 * 86_400_000);
    if (from > to) throw new AppError("Período inválido", 400);
    const data = await container.resolve(GetCrmOverviewUseCase).execute(shop, from, to, query.compare ?? false, request.user!);
    reply.send({ success: true, data });
  }

  async listClients(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = crmClientsSchema.parse(request.query); const shop = resolveShop(request, query.barbershopId);
    const result = await container.resolve(ListCrmClientsUseCase).execute(shop, query, request.user!);
    reply.send({ success: true, data: result.data, meta: { total: result.total, page: query.page, limit: query.limit, totalPages: Math.ceil(result.total / query.limit) || 1 } });
  }

  async client(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const shop = resolveShop(request, (request.query as { barbershopId?: string }).barbershopId);
    const { id } = request.params as { id: string };
    const data = await container.resolve(GetCrmClientUseCase).execute(shop, id, request.user!);
    reply.send({ success: true, data });
  }

  async merge(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = mergeClientsSchema.parse(request.body); const shop = resolveShop(request, body.barbershopId);
    await container.resolve(MergeCrmClientsUseCase).execute(shop, body.targetId, body.sourceIds, request.user!);
    reply.send({ success: true, message: "Clientes mesclados com sucesso" });
  }

  async backfill(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const shop = resolveShop(request, (request.body as { barbershopId?: string } | undefined)?.barbershopId);
    const data = await container.resolve(BackfillCrmUseCase).execute(shop, request.user!);
    reply.send({ success: true, data });
  }

  async forecast(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = crmForecastSchema.parse(request.query); const shop = resolveShop(request, query.barbershopId);
    const data = await container.resolve(GetCrmForecastUseCase).execute(shop, query.horizon, request.user!);
    reply.send({ success: true, data });
  }

  async previewCampaign(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = campaignSchema.parse(request.body); const shop = resolveShop(request, body.barbershopId);
    await assertCrmAccess(request.user!, shop, "CRM_CAMPAIGNS_MANAGE");
    const clientIds = await resolveCampaignClientIds(shop, body.segment, body.clientIds);
    const clients = await prisma.salonClient.findMany({ where: { barbershopId: shop, marketingOptIn: true, normalizedWhatsapp: { not: null }, ...(clientIds ? { id: { in: clientIds } } : {}) }, select: { id: true, name: true } });
    reply.send({ success: true, data: { eligibleCount: clients.length, sample: clients.slice(0, 10), message: body.message, segment: body.segment } });
  }

  async createCampaign(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = campaignSchema.parse(request.body); const shop = resolveShop(request, body.barbershopId);
    await assertCrmAccess(request.user!, shop, "CRM_CAMPAIGNS_MANAGE");
    const clientIds = await resolveCampaignClientIds(shop, body.segment, body.clientIds);
    const [barbershop, clients] = await Promise.all([
      prisma.barbershop.findUnique({ where: { id: shop }, select: { evolutionInstanceName: true } }),
      prisma.salonClient.findMany({ where: { barbershopId: shop, marketingOptIn: true, normalizedWhatsapp: { not: null }, ...(clientIds ? { id: { in: clientIds } } : {}) }, select: { id: true, whatsapp: true } }),
    ]);
    if (!barbershop?.evolutionInstanceName?.trim()) throw new AppError("Conecte o WhatsApp do salão antes de confirmar a campanha", 409);
    const campaign = await prisma.crmCampaign.create({ data: { barbershopId: shop, createdById: request.user!.id, name: body.name, segment: body.segment, message: body.message, status: "QUEUED", recipientCount: clients.length, confirmedAt: new Date(), recipients: { create: clients.map((client: any) => ({ clientId: client.id })) } }, include: { recipients: true } });
    await Promise.all(campaign.recipients.map((recipient: any, index: number) => enqueueWhatsApp({ phone: clients[index].whatsapp, message: body.message, instanceName: barbershop.evolutionInstanceName!, deduplicationKey: `crm-campaign:${campaign.id}:${recipient.id}`, campaignRecipientId: recipient.id })));
    reply.status(201).send({ success: true, data: campaign });
  }

  async campaign(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const shop = resolveShop(request, (request.query as { barbershopId?: string }).barbershopId); await assertCrmAccess(request.user!, shop, "CRM_CAMPAIGNS_MANAGE");
    const { id } = request.params as { id: string }; const data = await prisma.crmCampaign.findFirst({ where: { id, barbershopId: shop }, include: { recipients: { include: { client: { select: { id: true, name: true, whatsapp: true } } } } } });
    if (!data) throw new AppError("Campanha não encontrada", 404); reply.send({ success: true, data });
  }
}
