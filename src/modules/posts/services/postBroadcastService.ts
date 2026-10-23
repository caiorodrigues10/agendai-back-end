import { prisma } from "@/libs/prismaClient";
import { getModuleLogger } from "@/shared/utils/logger";
import { normalizeWhatsAppPhone } from "@/shared/services/evolutionApiService";
import { enqueuePostBroadcast } from "@/shared/infra/queue/postBroadcastQueue";

const logger = getModuleLogger("posts:broadcast");

/** Teto do download de arte hospedada (posts-art no Cloudinary). */
const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Resolve a imagem do post para base64 cru (sem prefixo data:), como a fila
 * de broadcast exige. Aceita data-URL (legado) e URL http(s) (arte em
 * `posts-art` — baixa com timeout). Retorna null quando não dá para obter a
 * imagem e o broadcast deve ser abortado.
 */
async function resolveBroadcastImage(postId: string, imageUrl: string): Promise<string | null> {
  if (imageUrl.startsWith("data:image")) {
    return imageUrl.replace(/^data:image\/[\w.+-]+;base64,/, "");
  }
  if (!/^https?:\/\//.test(imageUrl)) return null;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_REMOTE_IMAGE_BYTES) return null;
    return buffer.toString("base64");
  } catch (err) {
    logger.warn({ postId, err: err instanceof Error ? err.message : String(err) }, "Falha ao baixar imagem do post p/ broadcast");
    return null;
  }
}

/**
 * Enfileira jobs de broadcast de post via WhatsApp para todos os clientes
 * da barbearia. Chamado APENAS pela ação explícita "Enviar pelo WhatsApp"
 * (POST /posts/:id/whatsapp) — publicar/agendar não dispara mensagens.
 *
 * - Retorna quantos envios foram enfileirados.
 * - Erros internos são logados e não propagam — o controller decide o que responder.
 * - Deduplicação via postId + clientId.
 * - Ignora clientes sem WhatsApp.
 * - Usa a imagem já armazenada no post (imageUrl).
 */
export async function broadcastPostToClients(
  barbershopId: string,
  postId: string,
  title: string,
  ctaText: string | null
): Promise<number> {
  try {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { evolutionInstanceName: true },
    });

    if (!barbershop) return 0;

    if (!barbershop.evolutionInstanceName?.trim()) {
      logger.warn({ postId, barbershopId }, "Broadcast skipped — salão sem WhatsApp conectado");
      return 0;
    }

    const clients = await prisma.salonClient.findMany({
      where: {
        barbershopId,
        whatsapp: { not: "" },
      },
      select: { id: true, whatsapp: true },
    });

    if (clients.length === 0) {
      logger.info({ postId, barbershopId }, "No clients with WhatsApp — broadcast skipped");
      return 0;
    }

    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: {
        imageUrl: true,
        ctaText: true,
        title: true,
      },
    });

    if (!post || !post.imageUrl) {
      logger.warn({ postId }, "Post not found or has no image — broadcast aborted");
      return 0;
    }

    const imageBase64 = await resolveBroadcastImage(postId, post.imageUrl);
    if (!imageBase64) {
      logger.warn({ postId }, "Post image could not be resolved — broadcast aborted");
      return 0;
    }
    const resolvedTitle = title || post.title || "Novo post";
    const resolvedCta = ctaText || post.ctaText || null;
    const caption = [resolvedTitle, resolvedCta].filter(Boolean).join("\n\n");

    let queued = 0;

    for (const client of clients) {
      const finalPhone = normalizeWhatsAppPhone(client.whatsapp);
      if (!finalPhone) continue;

      await enqueuePostBroadcast({
        postId,
        barbershopId,
        imageBase64,
        caption,
        clientPhone: finalPhone,
        instanceName: barbershop.evolutionInstanceName,
        deduplicationKey: `post-broadcast:${postId}:${client.id}`,
      });
      queued++;
    }

    logger.info({ postId, barbershopId, queued }, "Post broadcast enqueued");
    return queued;
  } catch (err) {
    logger.error({ err, postId, barbershopId }, "Failed to broadcast post");
    return 0;
  }
}
