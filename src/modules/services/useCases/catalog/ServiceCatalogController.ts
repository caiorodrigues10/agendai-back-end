import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

const querySchema = z.object({
  categoryId: z.string().uuid().optional(),
  query: z.string().trim().min(1).max(100).optional(),
});

const bulkSchema = z.object({
  services: z.array(z.object({
    catalogItemId: z.string().uuid().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(2).max(100),
    price: z.number().min(0),
    avgTimeMinutes: z.number().int().min(5).max(600),
    icon: z.string().trim().min(1).max(80),
  })).min(1).max(50),
});

async function assertCategoryAccess(categoryId: string | null | undefined, barbershopId: string) {
  if (!categoryId) return;
  const category = await prisma.serviceCategory.findFirst({
    where: { id: categoryId, active: true, OR: [{ barbershopId: null }, { barbershopId }] },
    select: { id: true },
  });
  if (!category) throw new AppError("Categoria de serviço inválida", 400);
}

export class ServiceCatalogController {
  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { categoryId, query } = querySchema.parse(request.query);
    const data = await prisma.serviceCatalogItem.findMany({
      where: {
        active: true,
        ...(categoryId ? { categoryId } : {}),
        category: { barbershopId: null, active: true },
        ...(query ? { OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ] } : {}),
      },
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
      orderBy: [{ category: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    });
    reply.send({ success: true, data });
  }

  async bulkCreate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const barbershopId = user.barbershopId;
    if (!barbershopId) throw new AppError("Selecione uma barbearia para criar serviços", 400);
    const { services } = bulkSchema.parse(request.body);

    await Promise.all(services.map(service => assertCategoryAccess(service.categoryId, barbershopId)));
    const catalogIds = services.flatMap(service => service.catalogItemId ? [service.catalogItemId] : []);
    const catalogItems = catalogIds.length
      ? await prisma.serviceCatalogItem.findMany({ where: { id: { in: catalogIds }, active: true }, select: { id: true, categoryId: true } })
      : [];
    if (catalogItems.length !== new Set(catalogIds).size) throw new AppError("Item do catálogo inválido", 400);
    const catalogById = new Map<string, { id: string; categoryId: string }>(
      catalogItems.map((item: { id: string; categoryId: string }) => [item.id, item])
    );
    for (const service of services) {
      const catalogItem = service.catalogItemId ? catalogById.get(service.catalogItemId) : undefined;
      if (catalogItem && service.categoryId && catalogItem.categoryId !== service.categoryId) {
        throw new AppError("O serviço não pertence à categoria selecionada", 400);
      }
    }

    const created = await prisma.$transaction(services.map(service => prisma.service.create({
      data: { barbershopId, categoryId: service.categoryId ?? (service.catalogItemId ? catalogById.get(service.catalogItemId)?.categoryId : null), name: service.name, price: service.price, avgTimeMinutes: service.avgTimeMinutes, icon: service.icon },
      select: { id: true, barbershopId: true, categoryId: true, name: true, price: true, avgTimeMinutes: true, icon: true, createdAt: true, active: true },
    })));
    reply.status(201).send({ success: true, data: created });
  }
}

export { assertCategoryAccess };
