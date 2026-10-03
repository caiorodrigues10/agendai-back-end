import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";

export const publicPostSelect = {
  id: true, barbershopId: true, authorId: true, type: true, title: true,
  content: true, imageUrl: true, videoUrl: true, likes: true, createdAt: true,
  publishedAt: true, format: true, postMode: true, ctaText: true,
  author: { select: { name: true } },
  barbershop: { select: { name: true, logoUrl: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.FeedPostSelect;

export type PublicPostRow = Prisma.FeedPostGetPayload<{ select: typeof publicPostSelect }>;
export const commentSelect = {
  id: true, postId: true, authorId: true, clientIdentityId: true, content: true, createdAt: true,
  author: { select: { name: true } }, clientIdentity: { select: { name: true } },
} satisfies Prisma.PostCommentSelect;
export type CommentRow = Prisma.PostCommentGetPayload<{ select: typeof commentSelect }>;

export function activeStoryWhere(now = new Date()): Prisma.FeedPostWhereInput {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    format: "STORY",
    OR: [{ publishedAt: { gte: cutoff } }, { publishedAt: null, createdAt: { gte: cutoff } }],
  };
}

export function publishedPostWhere(salonId: string): Prisma.FeedPostWhereInput {
  return {
    barbershopId: salonId, status: "PUBLISHED", barbershop: { active: true },
    AND: [{ OR: [{ format: { not: "STORY" } }, activeStoryWhere()] }],
  };
}

export class SocialRepository {
  getPost(salonId: string, postId: string) {
    return prisma.feedPost.findFirst({ where: { ...publishedPostWhere(salonId), id: postId }, select: publicPostSelect });
  }

  stories(salonId: string) {
    return prisma.feedPost.findMany({
      where: { ...publishedPostWhere(salonId), ...activeStoryWhere() },
      select: publicPostSelect, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 30,
    });
  }

  async comments(postId: string, page: number, limit: number) {
    const where = { postId };
    const [data, total] = await Promise.all([
      prisma.postComment.findMany({ where, select: commentSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      prisma.postComment.count({ where }),
    ]);
    return { data, total };
  }

  createComment(postId: string, content: string, actor: { id: string; role: string }) {
    return prisma.postComment.create({
      data: { postId, content, ...(actor.role === "CLIENT" ? { clientIdentityId: actor.id } : { authorId: actor.id }) },
      select: commentSelect,
    });
  }

  getComment(postId: string, id: string) {
    return prisma.postComment.findFirst({ where: { id, postId }, select: commentSelect });
  }

  deleteComment(postId: string, id: string) {
    return prisma.postComment.deleteMany({ where: { id, postId } });
  }

  async validateActor(actor: { id: string; role: string }): Promise<{ id: string; role: string; barbershopId?: string } | null> {
    if (actor.role === "CLIENT") {
      const identity = await prisma.clientIdentity.findFirst({ where: { id: actor.id, phoneVerified: true }, select: { id: true } });
      return identity ? { id: identity.id, role: "CLIENT" } : null;
    }
    const user = await prisma.user.findFirst({ where: { id: actor.id, active: true, deletedAt: null }, select: { id: true, role: true, barbershopId: true } });
    return user ? { id: user.id, role: user.role, barbershopId: user.barbershopId ?? undefined } : null;
  }

  activeSalon(id: string) {
    return prisma.barbershop.findFirst({ where: { id, active: true }, select: { id: true } });
  }

  tagged(salonId: string, pending: boolean) {
    return prisma.postTag.findMany({
      where: {
        barbershopId: salonId, approvedAt: pending ? null : { not: null },
        barbershop: { active: true }, post: { status: "PUBLISHED", barbershop: { active: true }, format: { not: "STORY" } },
      },
      select: { id: true, postId: true, barbershopId: true, approvedAt: true, post: { select: publicPostSelect } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 60,
    });
  }

  requestTag(postId: string, barbershopId: string, requestedById: string) {
    return prisma.postTag.upsert({
      where: { postId_barbershopId: { postId, barbershopId } },
      create: { postId, barbershopId, requestedById }, update: {},
    });
  }

  async moderateTag(salonId: string, id: string, approve: boolean) {
    if (approve) return prisma.postTag.updateMany({ where: { id, barbershopId: salonId, approvedAt: null }, data: { approvedAt: new Date() } });
    return prisma.postTag.deleteMany({ where: { id, barbershopId: salonId } });
  }
}
