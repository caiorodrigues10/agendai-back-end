import { prisma } from "@/libs/prismaClient";
import { getModuleLogger } from "@/shared/utils/logger";
import { normalizeWhatsAppPhone } from "@/shared/services/evolutionApiService";
import { enqueuePostBroadcast } from "@/shared/infra/queue/postBroadcastQueue";

const logger = getModuleLogger("posts:broadcast");

/**
 * Enfileira jobs de broadcast de post via WhatsApp para todos os clientes
 * da barbearia. Chamado de forma fire-and-forget no controller.
 *
 * - Não aguarda conclusão dos jobs.
 * - Deduplicação via postId + clientId.
 * - Ignora clientes sem WhatsApp.
 * - Usa a imagem já armazenada no post (imageUrl).
 */
export async function broadcastPostToClients(
  barbershopId: string,
  postId: string,
  title: string,
  ctaText: string | null
): Promise<void> {
  try {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { evolutionInstanceName: true },
    });

    if (!barbershop) return;

    const clients = await prisma.salonClient.findMany({
      where: {
        barbershopId,
        whatsapp: { not: "" },
      },
      select: { id: true, whatsapp: true },
    });

    if (clients.length === 0) {
      logger.info({ postId, barbershopId }, "No clients with WhatsApp — broadcast skipped");
      return;
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
      return;
    }

    if (!post.imageUrl.startsWith("data:image")) {
      logger.warn({ postId }, "Post imageUrl is not a data URL — broadcast aborted");
      return;
    }

    const imageBase64 = post.imageUrl.replace(/^data:image\/\w+;base64,/, "");
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
  } catch (err) {
    logger.error({ err, postId, barbershopId }, "Failed to broadcast post");
  }
}
