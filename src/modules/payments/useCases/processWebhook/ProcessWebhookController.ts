import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ProcessWebhookUseCase } from "./ProcessWebhookUseCase";
import { IMercadoPagoWebhookDTO } from "../../dtos/IPaymentDTO";
import crypto from "node:crypto";
import { z } from "zod";

// IMP-2: Schema de validação do webhook para evitar crashes com payloads malformados
const webhookBodySchema = z.object({
  id: z.number().optional(),
  live_mode: z.boolean().optional(),
  type: z.string(),
  date_created: z.string().optional(),
  application_id: z.number().optional(),
  user_id: z.number().optional(),
  version: z.number().optional(),
  api_version: z.string().optional(),
  action: z.string().optional(),
  data: z.object({
    id: z.union([z.string(), z.number()]).transform(String)
  })
});

export class ProcessWebhookController {
  private validateSignature(request: FastifyRequest): boolean {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!secret) return true;

    const signatureHeader = request.headers["x-signature"] as string | undefined;
    const requestId = request.headers["x-request-id"] as string | undefined;

    if (!signatureHeader) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [k, v] = part.split("=");
        return [k.trim(), v.trim()];
      })
    );

    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;

    const rawBody = request.body as any;
    const dataId = rawBody?.data?.id ?? "";
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(v1, "hex"),
        Buffer.from(expected, "hex")
      );
    } catch {
      return false;
    }
  }

  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!this.validateSignature(request)) {
      return reply.status(401).send({ message: "Assinatura inválida" });
    }

    // IMP-2: Valida o body antes de processar
    const parseResult = webhookBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      request.log.warn({ errors: parseResult.error.errors }, "Webhook payload inválido recebido");
      // Retorna 200 mesmo assim — o MP não deve retentar por erro de schema nosso
      return reply.status(200).send({ received: true });
    }

    reply.status(200).send({ received: true });

    const useCase = container.resolve(ProcessWebhookUseCase);
    useCase
      .execute(parseResult.data as IMercadoPagoWebhookDTO)
      .catch((err) => {
        request.log.error(err, "Erro ao processar webhook do Mercado Pago");
      });
  }
}
