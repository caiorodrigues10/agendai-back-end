import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  FEED_TYPE_MAP,
  createFeedPostSchema,
  updateFeedPostSchema,
  listFeedQuerySchema,
} from "../schemas/feedSchemas";

const feedSelect = {
  id: true,
  barbershopId: true,
  type: true,
  title: true,
  content: true,
  imageUrl: true,
  likes: true,
  createdAt: true,
  status: true,
  scheduledFor: true,
  publishedAt: true,
  postMode: true,
  ctaText: true,
  author: { select: { name: true } },
} as const;

type FeedRow = {
  id: string;
  barbershopId: string;
  type: keyof typeof ENUM_TO_INPUT;
  title: string | null;
  content: string;
  imageUrl: string | null;
  likes: number;
  createdAt: Date;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED";
  scheduledFor: Date | null;
  publishedAt: Date | null;
  postMode: "QUEUE" | "APPOINTMENTS" | "BOTH";
  ctaText: string | null;
  author: { name: string } | null;
};

const ENUM_TO_INPUT = {
  HAIRCUT: "haircut",
  BEARD: "beard",
  ANNOUNCEMENT: "announcement",
} as const;

/** Converte a linha do banco para o formato consumido pelo front. */
function toResponse(post: FeedRow) {
  return {
    id: post.id,
    barbershopId: post.barbershopId,
    type: ENUM_TO_INPUT[post.type],
    title: post.title ?? undefined,
    content: post.content,
    imageUrl: post.imageUrl ?? undefined,
    likes: post.likes,
    createdAt: post.createdAt.getTime(),
    authorName: post.author?.name ?? "Equipe",
    status: post.status.toLowerCase(),
    scheduledFor: post.scheduledFor ? post.scheduledFor.getTime() : undefined,
    publishedAt: post.publishedAt ? post.publishedAt.getTime() : undefined,
    postMode: post.postMode.toLowerCase(),
    ctaText: post.ctaText ?? undefined,
  };
}

/** Garante que o staff autenticado pode operar posts desta barbearia. */
function assertSameBarbershop(user: { role: string; barbershopId?: string }, barbershopId: string) {
  if (user.role === "MASTER_ADMIN") return;
  if (user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: post não pertence ao seu salão", 403);
  }
}

export class FeedController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId } = listFeedQuerySchema.parse(request.query);
    if (!barbershopId) {
      throw new AppError("Informe o barbershopId para consultar o feed", 400);
    }

    const posts = await prisma.feedPost.findMany({
      where: { barbershopId, status: "PUBLISHED" },
      select: feedSelect,
      orderBy: { createdAt: "desc" },
    });

    return reply.status(200).send({ success: true, data: posts.map(toResponse) });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const body = createFeedPostSchema.parse(request.body);

    assertSameBarbershop(user, body.barbershopId);

    const post = await prisma.feedPost.create({
      data: {
        barbershopId: body.barbershopId,
        authorId: user.id,
        type: FEED_TYPE_MAP[body.type],
        title: body.title ?? null,
        content: body.content,
        imageUrl: body.imageUrl ?? null,
        // Posts criados pelo formulário antigo continuam públicos
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      select: feedSelect,
    });

    return reply.status(201).send({ success: true, data: toResponse(post) });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateFeedPostSchema.parse(request.body);
    const user = request.user;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, barbershopId: true, likes: true },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);

    const onlyLikes =
      body.likes !== undefined &&
      body.type === undefined &&
      body.title === undefined &&
      body.content === undefined &&
      body.imageUrl === undefined;

    // Curtir é público; edição de conteúdo exige staff da barbearia
    if (!onlyLikes) {
      if (!user) throw new AppError("Token ausente", 401);
      assertSameBarbershop(user, existing.barbershopId);
    }

    const post = await prisma.feedPost.update({
      where: { id },
      data: {
        ...(body.type && { type: FEED_TYPE_MAP[body.type] }),
        ...(body.title !== undefined && { title: body.title ?? null }),
        ...(body.content !== undefined && { content: body.content }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl ?? null }),
        // Curtidas: aceita apenas incremento de +1 por request (anti-abuso simples)
        ...(body.likes !== undefined && {
          likes: Math.min(body.likes, existing.likes + 1),
        }),
      },
      select: feedSelect,
    });

    return reply.status(200).send({ success: true, data: toResponse(post) });
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, barbershopId: true },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);

    assertSameBarbershop(user, existing.barbershopId);

    await prisma.feedPost.delete({ where: { id } });

    return reply.status(200).send({ success: true, message: "Post removido com sucesso" });
  }
}
