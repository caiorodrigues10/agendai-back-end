import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { FEED_TYPE_MAP } from "@/modules/feed/schemas/feedSchemas";
import {
  POST_MODE_MAP,
  createPostSchema,
  updatePostSchema,
  previewPostQuerySchema,
  listScheduledQuerySchema,
  getConfigQuerySchema,
  saveConfigBodySchema,
  postParamsSchema,
  generatePostSchema,
} from "../schemas/postsSchemas";
import {
  buildPostSvg,
  pngToDataUrl,
  renderPostSvgToPng,
} from "../services/postImageService";
import {
  generatePostContent,
  DailyLimitExceededError,
} from "../services/postAiService";
import { broadcastPostToClients } from "../services/postBroadcastService";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("posts:controller");

const ENUM_TO_INPUT = {
  HAIRCUT: "haircut",
  BEARD: "beard",
  ANNOUNCEMENT: "announcement",
} as const;

const postSelect = {
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

type PostRow = {
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

/** Converte a linha do banco para o formato consumido pelo front. */
function toPostResponse(post: PostRow) {
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
function assertSameBarbershop(
  user: { role: string; barbershopId?: string },
  barbershopId: string
) {
  if (user.role === "MASTER_ADMIN") return;
  if (user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: post não pertence ao seu salão", 403);
  }
}

function defaultCtaText(postMode: "queue" | "appointments" | "both"): string {
  if (postMode === "queue") return "Entrar na fila";
  if (postMode === "appointments") return "Agendar horário";
  return "Fila ou agenda";
}

/** Carrega o contexto visual do post: salão, serviços top 3 e horário de hoje. */
async function loadPostContext(barbershopId: string) {
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { id: true, name: true, logoUrl: true },
  });
  if (!barbershop) throw new AppError("Barbearia não encontrada", 404);

  const [services, schedule] = await Promise.all([
    prisma.service.findMany({
      where: { barbershopId, active: true },
      select: { name: true, price: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.schedule.findFirst({
      where: { barbershopId, dayOfWeek: new Date().getDay() },
      select: { isOpen: true, openTime: true, closeTime: true },
    }),
  ]);

  return { barbershop, services, schedule };
}

/** Gera a imagem (SVG → PNG → data-URL) com os defaults de título e CTA. */
async function buildPostImage(
  barbershopId: string,
  opts: {
    title?: string | null;
    ctaText?: string | null;
    postMode: "queue" | "appointments" | "both";
  }
) {
  const { barbershop, services, schedule } = await loadPostContext(barbershopId);
  const title = opts.title ?? "Vem pra cá hoje!";
  const ctaText = opts.ctaText ?? defaultCtaText(opts.postMode);
  const svg = buildPostSvg({
    shopName: barbershop.name,
    logoUrl: barbershop.logoUrl,
    services,
    todaySchedule: schedule,
    postMode: opts.postMode,
    ctaText,
    title,
  });
  return pngToDataUrl(renderPostSvgToPng(svg));
}

export class PostsController {
  /** Pré-visualiza a imagem do post sem persistir nada. */
  async preview(request: FastifyRequest, reply: FastifyReply) {
    const query = previewPostQuerySchema.parse(request.query);
    const imageUrl = await buildPostImage(query.barbershopId, {
      postMode: query.postMode,
    });
    return reply.status(200).send({ success: true, data: { imageUrl } });
  }

  /** Gera sugestões de título/CTA via IA (ou templates locais como fallback). */
  async generate(request: FastifyRequest, reply: FastifyReply) {
    const body = generatePostSchema.parse(request.body);
    const user = request.user!;

    assertSameBarbershop(user, body.barbershopId);

    try {
      const result = await generatePostContent(body);
      return reply.status(200).send({ success: true, data: result });
    } catch (err) {
      if (err instanceof DailyLimitExceededError) {
        return reply.status(429).send({
          success: false,
          code: err.code,
          message: err.message,
          retryAfter: err.retryAfter.toISOString(),
        });
      }
      throw err;
    }
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const body = createPostSchema.parse(request.body);

    assertSameBarbershop(user, body.barbershopId);

    const imageUrl = await buildPostImage(body.barbershopId, {
      title: body.title,
      ctaText: body.ctaText,
      postMode: body.postMode,
    });

    const parsedScheduledFor = body.scheduledFor
      ? new Date(body.scheduledFor)
      : null;
    const isScheduled =
      parsedScheduledFor !== null && parsedScheduledFor.getTime() > Date.now();
    const status = isScheduled ? "SCHEDULED" : "PUBLISHED";

    const post = await prisma.feedPost.create({
      data: {
        barbershopId: body.barbershopId,
        authorId: user.id,
        type: FEED_TYPE_MAP[body.type],
        title: body.title ?? "Vem pra cá hoje!",
        content: body.content,
        imageUrl,
        status,
        postMode: POST_MODE_MAP[body.postMode],
        ctaText: body.ctaText ?? defaultCtaText(body.postMode),
        scheduledFor: isScheduled ? parsedScheduledFor : null,
        publishedAt: isScheduled ? null : new Date(),
      },
      select: postSelect,
    });

    // Fire-and-forget: broadcast post image to clients if status is PUBLISHED
    if (status === "PUBLISHED") {
      broadcastPostToClients(
        body.barbershopId,
        post.id,
        body.title ?? "Vem pra cá hoje!",
        body.ctaText ?? null
      ).catch((err) => logger.error({ err, postId: post.id }, "Broadcast post failed"));
    }

    return reply.status(201).send({ success: true, data: toPostResponse(post) });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = postParamsSchema.parse(request.params);
    const body = updatePostSchema.parse(request.body);
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, barbershopId: true, status: true },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);

    assertSameBarbershop(user, existing.barbershopId);

    const wasNotPublished = existing.status !== "PUBLISHED";

    let statusData: {
      status: "DRAFT" | "SCHEDULED" | "PUBLISHED";
      publishedAt: Date | null;
      scheduledFor: Date | null;
    } | null = null;

    if (body.status === "published" || body.scheduledFor === null) {
      statusData = {
        status: "PUBLISHED",
        publishedAt: new Date(),
        scheduledFor: null,
      };
    } else if (body.scheduledFor) {
      statusData = {
        status: "SCHEDULED",
        publishedAt: null,
        scheduledFor: new Date(body.scheduledFor),
      };
    }

    const post = await prisma.feedPost.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.ctaText !== undefined && { ctaText: body.ctaText }),
        ...(body.postMode && { postMode: POST_MODE_MAP[body.postMode] }),
        ...(statusData ?? {}),
      },
      select: postSelect,
    });

    // Fire-and-forget: broadcast post image to clients on transition to PUBLISHED
    if (wasNotPublished && statusData?.status === "PUBLISHED") {
      broadcastPostToClients(
        existing.barbershopId,
        post.id,
        post.title ?? "Vem pra cá hoje!",
        post.ctaText ?? null
      ).catch((err) => logger.error({ err, postId: post.id }, "Broadcast post failed"));
    }

    return reply.status(200).send({ success: true, data: toPostResponse(post) });
  }

  /** Lista rascunhos e posts agendados (nunca publicados). */
  async listScheduled(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId } = listScheduledQuerySchema.parse(request.query);
    const user = request.user!;

    assertSameBarbershop(user, barbershopId);

    const posts = await prisma.feedPost.findMany({
      where: { barbershopId, status: { in: ["DRAFT", "SCHEDULED"] } },
      select: postSelect,
      orderBy: { scheduledFor: "asc" },
    });

    return reply
      .status(200)
      .send({ success: true, data: posts.map(toPostResponse) });
  }

  async getConfig(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId } = getConfigQuerySchema.parse(request.query);
    const user = request.user!;

    assertSameBarbershop(user, barbershopId);

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { autoPostEnabled: true },
    });
    if (!barbershop) throw new AppError("Barbearia não encontrada", 404);

    return reply
      .status(200)
      .send({ success: true, data: { autoPostEnabled: barbershop.autoPostEnabled } });
  }

  async saveConfig(request: FastifyRequest, reply: FastifyReply) {
    const body = saveConfigBodySchema.parse(request.body);
    const user = request.user!;

    assertSameBarbershop(user, body.barbershopId);

    const barbershop = await prisma.barbershop.update({
      where: { id: body.barbershopId },
      data: { autoPostEnabled: body.autoPostEnabled },
      select: { autoPostEnabled: true },
    });

    return reply
      .status(200)
      .send({ success: true, data: { autoPostEnabled: barbershop.autoPostEnabled } });
  }

  /** Remove apenas rascunhos/agendados; publicados seguem o fluxo do feed. */
  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = postParamsSchema.parse(request.params);
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, barbershopId: true, status: true },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);

    assertSameBarbershop(user, existing.barbershopId);

    if (existing.status === "PUBLISHED") {
      throw new AppError(
        "Posts publicados não podem ser removidos por aqui; use o feed",
        400
      );
    }

    await prisma.feedPost.delete({ where: { id } });

    return reply
      .status(200)
      .send({ success: true, message: "Rascunho removido com sucesso" });
  }
}