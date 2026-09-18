import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  createShowcaseEntrySchema,
  updateShowcaseEntrySchema,
  showcaseModeMap,
  showcaseStatusMap,
  imageAuthorizationMap,
} from "./showcaseSchema";
import type { z } from "zod";

type CreateInput = z.infer<typeof createShowcaseEntrySchema>;
type UpdateInput = z.infer<typeof updateShowcaseEntrySchema>;

const publicEntrySelect = {
  id: true,
  barbershopId: true,
  postId: true,
  title: true,
  description: true,
  altText: true,
  mode: true,
  serviceId: true,
  staffId: true,
  position: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  barbershop: { select: { id: true, name: true } },
  post: { select: { id: true, imageUrl: true, videoUrl: true, content: true } },
  service: { select: { id: true, name: true, price: true } },
  staff: { select: { id: true, name: true, avatarUrl: true } },
} as const;

const entrySelect = {
  ...publicEntrySelect,
  imageAuthorization: true,
  authorizedById: true,
  authorizedAt: true,
  authorizationNote: true,
  hiddenAt: true,
  authorizedBy: { select: { id: true, name: true } },
} as const;

export class ShowcaseRepository {
  async listByBarbershop(barbershopId: string, status?: string) {
    return prisma.showcaseEntry.findMany({
      where: {
        barbershopId,
        ...(status ? { status: status.toUpperCase() as any } : {}),
      },
      select: entrySelect,
      orderBy: { position: "asc" },
    });
  }

  async listPublished(barbershopId: string) {
    return prisma.showcaseEntry.findMany({
      where: { barbershopId, status: "PUBLISHED" },
      select: publicEntrySelect,
      orderBy: { position: "asc" },
    });
  }

  async findPublishedById(barbershopId: string, entryId: string) {
    return prisma.showcaseEntry.findFirst({
      where: { id: entryId, barbershopId, status: "PUBLISHED" },
      select: publicEntrySelect,
    });
  }

  async findById(id: string) {
    return prisma.showcaseEntry.findUnique({
      where: { id },
      select: entrySelect,
    });
  }

  async findByPostId(postId: string) {
    return prisma.showcaseEntry.findUnique({
      where: { postId },
      select: entrySelect,
    });
  }

  async create(data: CreateInput) {
    const post = await prisma.feedPost.findUnique({
      where: { id: data.postId },
      select: { id: true, barbershopId: true },
    });
    if (!post) throw new AppError("Post não encontrado", 404);
    if (post.barbershopId !== data.barbershopId) {
      throw new AppError("Post não pertence a esta barbearia", 400);
    }

    const existing = await prisma.showcaseEntry.findUnique({
      where: { postId: data.postId },
    });
    if (existing) throw new AppError("Este post já está vinculado a um showcase", 409);

    const maxPosition = await prisma.showcaseEntry.aggregate({
      where: { barbershopId: data.barbershopId },
      _max: { position: true },
    });

    return prisma.showcaseEntry.create({
      data: {
        barbershopId: data.barbershopId,
        postId: data.postId,
        title: data.title,
        description: data.description ?? null,
        altText: data.altText ?? null,
        mode: showcaseModeMap[data.mode],
        serviceId: data.serviceId ?? null,
        staffId: data.staffId ?? null,
        position: (maxPosition._max.position ?? -1) + 1,
        imageAuthorization: imageAuthorizationMap[data.imageAuthorization],
        authorizedById: data.authorizedById ?? null,
        authorizationNote: data.authorizationNote ?? null,
      },
      select: entrySelect,
    });
  }

  async update(id: string, data: UpdateInput) {
    const existing = await prisma.showcaseEntry.findUnique({ where: { id } });
    if (!existing) throw new AppError("Showcase entry não encontrado", 404);

    return prisma.showcaseEntry.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.altText !== undefined && { altText: data.altText }),
        ...(data.mode !== undefined && { mode: showcaseModeMap[data.mode] }),
        ...(data.serviceId !== undefined && { serviceId: data.serviceId }),
        ...(data.staffId !== undefined && { staffId: data.staffId }),
        ...(data.imageAuthorization !== undefined && {
          imageAuthorization: imageAuthorizationMap[data.imageAuthorization],
        }),
        ...(data.authorizedById !== undefined && { authorizedById: data.authorizedById }),
        ...(data.authorizationNote !== undefined && { authorizationNote: data.authorizationNote }),
      },
      select: entrySelect,
    });
  }

  async publish(id: string) {
    const existing = await prisma.showcaseEntry.findUnique({ where: { id } });
    if (!existing) throw new AppError("Showcase entry não encontrado", 404);
    if (existing.imageAuthorization !== "TEAM_CONFIRMED") {
      throw new AppError("Imagem precisa de autorização antes de publicar", 400);
    }

    return prisma.showcaseEntry.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
      select: entrySelect,
    });
  }

  async hide(id: string) {
    const existing = await prisma.showcaseEntry.findUnique({ where: { id } });
    if (!existing) throw new AppError("Showcase entry não encontrado", 404);

    return prisma.showcaseEntry.update({
      where: { id },
      data: { status: "HIDDEN", hiddenAt: new Date() },
      select: entrySelect,
    });
  }

  async delete(id: string) {
    const existing = await prisma.showcaseEntry.findUnique({ where: { id } });
    if (!existing) throw new AppError("Showcase entry não encontrado", 404);

    await prisma.showcaseEntry.delete({ where: { id } });
  }

  async reorder(barbershopId: string, entries: { id: string; position: number }[]) {
    const tx = entries.map((e) =>
      prisma.showcaseEntry.updateMany({
        where: { id: e.id, barbershopId },
        data: { position: e.position },
      })
    );
    await prisma.$transaction(tx);
  }

  async recordEvent(entryId: string, barbershopId: string, eventType: string, metadata?: Record<string, unknown>) {
    return prisma.showcaseEvent.create({
      data: {
        entryId,
        barbershopId,
        eventType: eventType as any,
        metadata: metadata ?? undefined,
      },
    });
  }

  async getAnalytics(barbershopId: string, entryId?: string) {
    const where = { barbershopId, ...(entryId ? { entryId } : {}) };

    const events = await prisma.showcaseEvent.groupBy({
      by: ["eventType"],
      where,
      _count: { _all: true },
    });

    const totalViews = await prisma.showcaseEvent.count({
      where: { ...where, eventType: "VIEW" },
    });

    const totalClicks = await prisma.showcaseEvent.count({
      where: {
        barbershopId,
        ...(entryId ? { entryId } : {}),
        eventType: { in: ["CLICK_BOOK", "CLICK_WHATSAPP"] },
      },
    });

    return {
      totalViews,
      totalClicks,
      clickRate: totalViews > 0 ? (totalClicks / totalViews) * 100 : 0,
      byType: events.reduce((acc: Record<string, number>, e: any) => {
        acc[e.eventType] = e._count._all;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
