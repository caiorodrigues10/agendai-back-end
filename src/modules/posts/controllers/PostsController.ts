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
  listPostsQuerySchema,
  schedulePostSchema,
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
import { whatsAppNotConnectedError } from "@/modules/barbershops/utils/shopEvolutionInstance";
import { listPostTemplates } from "../services/postTemplates";
import { listPostPalettes } from "../services/postPalettes";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";

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
  templateKey: true,
  format: true,
  paletteKey: true,
  designOptions: true,
  primaryMediaId: true,
  secondaryMediaId: true,
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
  templateKey: string;
  format: "SQUARE" | "PORTRAIT" | "STORY";
  paletteKey: string;
  designOptions: unknown;
  primaryMediaId: string | null;
  secondaryMediaId: string | null;
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
    templateKey: post.templateKey ?? "agenda-aberta",
    format: (post.format ?? "SQUARE").toLowerCase(),
    paletteKey: post.paletteKey ?? "brand",
    designOptions: post.designOptions,
    primaryMediaId: post.primaryMediaId ?? undefined,
    secondaryMediaId: post.secondaryMediaId ?? undefined,
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

async function assertShopWhatsAppConnected(barbershopId: string): Promise<void> {
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { evolutionInstanceName: true },
  });
  if (!shop?.evolutionInstanceName?.trim()) throw whatsAppNotConnectedError();
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

async function loadMediaDataUrl(
  mediaId: string | null | undefined,
  barbershopId: string
): Promise<string | null> {
  if (!mediaId) return null;
  const media = await prisma.postMedia.findFirst({
    where: { id: mediaId, barbershopId },
    select: { url: true },
  });
  if (!media?.url) return null;
  const response = await fetch(media.url);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

async function loadExternalImageUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Gera a imagem (SVG → PNG → data-URL) com os defaults de título e CTA. */
async function buildPostImage(
  barbershopId: string,
  opts: {
    title?: string | null;
    ctaText?: string | null;
    postMode: "queue" | "appointments" | "both";
    templateKey?: string;
    format?: "square" | "portrait" | "story";
    paletteKey?: string;
    designOptions?: { focalX?: number; focalY?: number; overlay?: number };
    primaryMediaId?: string | null;
    secondaryMediaId?: string | null;
  }
) {
  const { barbershop, services, schedule } = await loadPostContext(barbershopId);
  const title = opts.title ?? "Vem pra cá hoje!";
  const ctaText = opts.ctaText ?? defaultCtaText(opts.postMode);
  const [primaryImageUrl, secondaryImageUrl, logoDataUrl] = await Promise.all([
    loadMediaDataUrl(opts.primaryMediaId, barbershopId),
    loadMediaDataUrl(opts.secondaryMediaId, barbershopId),
    // Fetch shop logo URL and convert to data URL for the renderer
    barbershop.logoUrl ? loadExternalImageUrl(barbershop.logoUrl) : Promise.resolve(null),
  ]);
  const svg = buildPostSvg({
    shopName: barbershop.name,
    logoUrl: logoDataUrl,
    services,
    todaySchedule: schedule,
    postMode: opts.postMode,
    ctaText,
    title,
    templateKey: opts.templateKey,
    format: opts.format,
    paletteKey: opts.paletteKey,
    designOptions: opts.designOptions,
    primaryImageUrl,
    secondaryImageUrl,
  });
  return pngToDataUrl(renderPostSvgToPng(svg));
}

export class PostsController {
  async templates(_request: FastifyRequest, reply: FastifyReply) {
    return reply.status(200).send({ success: true, data: listPostTemplates() });
  }

  async palettes(_request: FastifyRequest, reply: FastifyReply) {
    return reply.status(200).send({ success: true, data: listPostPalettes() });
  }

  /** Pré-visualiza a imagem do post sem persistir nada. */
  async preview(request: FastifyRequest, reply: FastifyReply) {
    const query = previewPostQuerySchema.parse(request.query);
    assertSameBarbershop(request.user!, query.barbershopId);
    const imageUrl = await buildPostImage(query.barbershopId, {
      postMode: query.postMode,
      title: query.title,
      ctaText: query.ctaText,
      templateKey: query.templateKey,
      format: query.format,
      paletteKey: query.paletteKey,
      primaryMediaId: query.primaryMediaId,
      secondaryMediaId: query.secondaryMediaId,
      designOptions: query.designOptions,
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

  /**
   * Cria um post. Por padrão nasce como DRAFT — publicação e agendamento
   * têm rotas de ação explícitas. Nunca dispara WhatsApp aqui.
   */
  async create(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const body = createPostSchema.parse(request.body);

    assertSameBarbershop(user, body.barbershopId);

    const parsedScheduledFor = body.scheduledFor
      ? new Date(body.scheduledFor)
      : null;
    if (parsedScheduledFor && parsedScheduledFor.getTime() <= Date.now()) {
      throw new AppError("O agendamento precisa estar no futuro", 400);
    }

    const status =
      parsedScheduledFor !== null
        ? ("SCHEDULED" as const)
        : ("DRAFT" as const);

    const imageUrl = await buildPostImage(body.barbershopId, {
      title: body.title,
      ctaText: body.ctaText,
      postMode: body.postMode,
      templateKey: body.templateKey ?? "agenda-aberta",
      format: body.format ?? "square",
      paletteKey: body.paletteKey ?? "brand",
      designOptions: body.designOptions ?? undefined,
      primaryMediaId: body.primaryMediaId,
      secondaryMediaId: body.secondaryMediaId,
    });

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
        templateKey: body.templateKey ?? "agenda-aberta",
        format: (body.format ?? "square").toUpperCase() as "SQUARE" | "PORTRAIT" | "STORY",
        paletteKey: body.paletteKey ?? "brand",
        designOptions: body.designOptions,
        primaryMediaId: body.primaryMediaId ?? null,
        secondaryMediaId: body.secondaryMediaId ?? null,
        scheduledFor: parsedScheduledFor,
        publishedAt: null,
      },
      select: postSelect,
    });

    return reply.status(201).send({ success: true, data: toPostResponse(post) });
  }

  /**
   * Edita conteúdo/mídia/opções visuais. Se algo visual mudou, regenera a
   * imagem ANTES de salvar; se a geração falhar, o post fica intacto.
   * Transições de status NÃO acontecem aqui — usar as rotas de ação.
   */
  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = postParamsSchema.parse(request.params);
    const body = updatePostSchema.parse(request.body);
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: {
        id: true,
        barbershopId: true,
        status: true,
        title: true,
        ctaText: true,
        postMode: true,
        templateKey: true,
        format: true,
        paletteKey: true,
        designOptions: true,
        primaryMediaId: true,
        secondaryMediaId: true,
      },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);

    assertSameBarbershop(user, existing.barbershopId);

    const visualChanged =
      body.title !== undefined ||
      body.ctaText !== undefined ||
      body.templateKey !== undefined ||
      body.format !== undefined ||
      body.paletteKey !== undefined ||
      body.designOptions !== undefined ||
      body.primaryMediaId !== undefined ||
      body.secondaryMediaId !== undefined;

    let imageUrl: string | undefined;
    if (visualChanged) {
      const formatEnumToInput: Record<"SQUARE" | "PORTRAIT" | "STORY", "square" | "portrait" | "story"> = {
        SQUARE: "square",
        PORTRAIT: "portrait",
        STORY: "story",
      };
      const modeEnumToInput: Record<"QUEUE" | "APPOINTMENTS" | "BOTH", "queue" | "appointments" | "both"> = {
        QUEUE: "queue",
        APPOINTMENTS: "appointments",
        BOTH: "both",
      };
      imageUrl = await buildPostImage(existing.barbershopId, {
        title: body.title !== undefined ? body.title : existing.title,
        ctaText: body.ctaText !== undefined ? body.ctaText : existing.ctaText,
        postMode: body.postMode ?? modeEnumToInput[existing.postMode as "QUEUE" | "APPOINTMENTS" | "BOTH"],
        templateKey: body.templateKey ?? existing.templateKey,
        format:
          body.format ?? formatEnumToInput[(existing.format ?? "SQUARE") as "SQUARE" | "PORTRAIT" | "STORY"],
        paletteKey: body.paletteKey ?? existing.paletteKey,
        designOptions:
          body.designOptions !== undefined
            ? body.designOptions ?? undefined
            : (existing.designOptions as { focalX?: number; focalY?: number; overlay?: number } | undefined) ?? undefined,
        primaryMediaId:
          body.primaryMediaId !== undefined
            ? body.primaryMediaId
            : existing.primaryMediaId,
        secondaryMediaId:
          body.secondaryMediaId !== undefined
            ? body.secondaryMediaId
            : existing.secondaryMediaId,
      });
    }

    const post = await prisma.feedPost.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.ctaText !== undefined && { ctaText: body.ctaText }),
        ...(body.content !== undefined && { content: body.content }),
        ...(body.postMode && { postMode: POST_MODE_MAP[body.postMode] }),
        ...(body.templateKey && { templateKey: body.templateKey }),
        ...(body.format && { format: body.format.toUpperCase() as "SQUARE" | "PORTRAIT" | "STORY" }),
        ...(body.paletteKey && { paletteKey: body.paletteKey }),
        ...(body.designOptions !== undefined && { designOptions: body.designOptions }),
        ...(body.primaryMediaId !== undefined && { primaryMediaId: body.primaryMediaId }),
        ...(body.secondaryMediaId !== undefined && { secondaryMediaId: body.secondaryMediaId }),
        ...(imageUrl !== undefined && { imageUrl }),
      },
      select: postSelect,
    });

    return reply.status(200).send({ success: true, data: toPostResponse(post) });
  }

  /**
   * Publica um rascunho/agendado no perfil. Atômico: a guarda de status no
   * UPDATE impede publicação dupla mesmo com requisições concorrentes.
   * Não exige WhatsApp e não envia mensagens.
   */
  async publish(request: FastifyRequest, reply: FastifyReply) {
    const { id } = postParamsSchema.parse(request.params);
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, barbershopId: true, status: true },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);
    assertSameBarbershop(user, existing.barbershopId);

    const result = await prisma.feedPost.updateMany({
      where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "PUBLISHED", publishedAt: new Date(), scheduledFor: null },
    });
    if (result.count === 0) {
      throw new AppError("Este post já está publicado", 409);
    }

    const post = await prisma.feedPost.findUnique({ where: { id }, select: postSelect });
    return reply.status(200).send({ success: true, data: toPostResponse(post!) });
  }

  /** Agenda (ou reagenda) um post. Requer horário futuro (persistido em UTC). */
  async schedule(request: FastifyRequest, reply: FastifyReply) {
    const { id } = postParamsSchema.parse(request.params);
    const body = schedulePostSchema.parse(request.body);
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, barbershopId: true, status: true },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);
    assertSameBarbershop(user, existing.barbershopId);

    const when = new Date(body.scheduledFor);
    if (when.getTime() <= Date.now()) {
      throw new AppError("O agendamento precisa estar no futuro", 400);
    }

    const post = await prisma.feedPost.update({
      where: { id },
      data: { status: "SCHEDULED", scheduledFor: when, publishedAt: null },
      select: postSelect,
    });

    return reply.status(200).send({ success: true, data: toPostResponse(post) });
  }

  /** Cancela o agendamento: o post volta a ser rascunho. */
  async cancelSchedule(request: FastifyRequest, reply: FastifyReply) {
    const { id } = postParamsSchema.parse(request.params);
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, barbershopId: true, status: true },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);
    assertSameBarbershop(user, existing.barbershopId);

    if (existing.status !== "SCHEDULED") {
      throw new AppError("Este post não está agendado", 400);
    }

    const post = await prisma.feedPost.update({
      where: { id },
      data: { status: "DRAFT", scheduledFor: null },
      select: postSelect,
    });

    return reply.status(200).send({ success: true, data: toPostResponse(post) });
  }

  /**
   * "Enviar pelo WhatsApp" — ação separada da publicação.
   * Lock no Redis impede envio duplicado ( retries / double-click ).
   */
  async sendWhatsapp(request: FastifyRequest, reply: FastifyReply) {
    const { id } = postParamsSchema.parse(request.params);
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: {
        id: true,
        barbershopId: true,
        status: true,
        title: true,
        ctaText: true,
        imageUrl: true,
      },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);
    assertSameBarbershop(user, existing.barbershopId);

    if (existing.status !== "PUBLISHED") {
      throw new AppError("Publique o post no perfil antes de enviar pelo WhatsApp", 400);
    }

    await assertShopWhatsAppConnected(existing.barbershopId);

    const redis = getRedisConnection();
    const lockKey = `posts:whatsapp:lock:${existing.id}`;
    const acquired = await redis.set(lockKey, "1", "EX", 3600, "NX");
    if (!acquired) {
      throw new AppError(
        "Este post já foi enviado pelo WhatsApp recentemente",
        409
      );
    }

    try {
      const queued = await broadcastPostToClients(
        existing.barbershopId,
        existing.id,
        existing.title ?? "Novo post",
        existing.ctaText ?? null
      );

      return reply.status(200).send({ success: true, data: { queued } });
    } catch (err) {
      await redis.del(lockKey);
      throw err;
    }
  }

  /** Contagem de clientes elegíveis para o envio (prévia da confirmação). */
  async whatsappAudience(request: FastifyRequest, reply: FastifyReply) {
    const { id } = postParamsSchema.parse(request.params);
    const user = request.user!;

    const existing = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, barbershopId: true, status: true },
    });
    if (!existing) throw new AppError("Post não encontrado", 404);
    assertSameBarbershop(user, existing.barbershopId);

    const shop = await prisma.barbershop.findUnique({
      where: { id: existing.barbershopId },
      select: { evolutionInstanceName: true },
    });

    const eligible = await prisma.salonClient.count({
      where: { barbershopId: existing.barbershopId, whatsapp: { not: "" } },
    });

    return reply.status(200).send({
      success: true,
      data: {
        eligible,
        whatsappConnected: Boolean(shop?.evolutionInstanceName?.trim()),
        postPublished: existing.status === "PUBLISHED",
      },
    });
  }

  /** Listagem paginada por status — gestão (abas Publicados/Agendados/Rascunhos). */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = listPostsQuerySchema.parse(request.query);
    const user = request.user!;

    assertSameBarbershop(user, query.barbershopId);

    const where = {
      barbershopId: query.barbershopId,
      ...(query.status
        ? { status: query.status.toUpperCase() as "DRAFT" | "SCHEDULED" | "PUBLISHED" }
        : {}),
    };

    const [posts, total] = await Promise.all([
      prisma.feedPost.findMany({
        where,
        select: postSelect,
        orderBy: query.status === "scheduled"
          ? { scheduledFor: "asc" }
          : { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.feedPost.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: posts.map(toPostResponse),
      meta: { total, page: query.page, limit: query.limit },
    });
  }

  /** Compat: rascunhos + agendados (legado do frontend antigo). */
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

  /** Remove rascunhos/agendados; publicados seguem o fluxo do feed. */
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
