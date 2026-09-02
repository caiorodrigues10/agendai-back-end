import { Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Resend } from "resend";
import { processResendWebhook } from "../services/resendWebhookService";

type RawBodyRequest = FastifyRequest & { rawBody?: string };

export async function resendWebhookPreParsing(
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: NodeJS.ReadableStream,
): Promise<NodeJS.ReadableStream> {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  (request as RawBodyRequest).rawBody = raw.toString("utf8");
  return Readable.from(raw);
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export class ResendWebhookController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    const rawBody = (request as RawBodyRequest).rawBody;
    const id = header(request, "svix-id");
    const timestamp = header(request, "svix-timestamp");
    const signature = header(request, "svix-signature");

    if (!webhookSecret) {
      request.log.error("RESEND_WEBHOOK_SECRET não configurado");
      return reply.status(503).send({ received: false });
    }
    if (!rawBody || !id || !timestamp || !signature) {
      return reply.status(401).send({ received: false, message: "Assinatura ausente" });
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY?.trim() || "re_webhook_verification");
      const event = resend.webhooks.verify({
        payload: rawBody,
        headers: { id, timestamp, signature },
        webhookSecret,
      });
      const result = await processResendWebhook(id, event, rawBody);
      return reply.status(200).send({ received: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      if (/signature|timestamp|webhook/i.test(message)) {
        request.log.warn({ eventId: id }, "Webhook Resend com assinatura inválida");
        return reply.status(401).send({ received: false, message: "Assinatura inválida" });
      }
      request.log.error({ err: error, eventId: id }, "Falha ao processar webhook Resend");
      return reply.status(500).send({ received: false });
    }
  }
}

