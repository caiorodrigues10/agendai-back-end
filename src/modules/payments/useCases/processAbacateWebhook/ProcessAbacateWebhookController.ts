import { FastifyRequest, FastifyReply } from "fastify";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import { container } from "tsyringe";
import { AbacatePayService } from "../../services/AbacatePayService";
import {
  IAbacateWebhookPayload,
  ProcessAbacateWebhookUseCase,
} from "./ProcessAbacateWebhookUseCase";

type RequestWithRawBody = FastifyRequest & { rawBody?: string };

/**
 * Captura o body bruto para validação HMAC e reencaminha o stream ao parser JSON.
 */
export async function abacateWebhookPreParsing(
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: NodeJS.ReadableStream
): Promise<NodeJS.ReadableStream> {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  (request as RequestWithRawBody).rawBody = raw.toString("utf8");
  return Readable.from(raw);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Só permite bypass local explícito (nunca por NODE_ENV=development sozinho).
 * Staging/produção devem sempre exigir secret + HMAC.
 */
function allowInsecureWebhooks(): boolean {
  return process.env.ALLOW_INSECURE_WEBHOOKS === "true";
}

export class ProcessAbacateWebhookController {
  private extractProvidedSecret(request: FastifyRequest): string | undefined {
    const header = request.headers["x-webhook-secret"];
    if (typeof header === "string" && header.length > 0) return header;
    const query = request.query as { webhookSecret?: string };
    return query.webhookSecret;
  }

  private validateSecret(request: FastifyRequest): boolean {
    const expected = process.env.ABACATEPAY_WEBHOOK_SECRET;

    if (!expected || expected.trim().length < 16) {
      if (allowInsecureWebhooks()) {
        request.log.warn(
          "ALLOW_INSECURE_WEBHOOKS=true — secret AbacatePay não exigido (somente local)."
        );
        return true;
      }
      request.log.error(
        "ABACATEPAY_WEBHOOK_SECRET ausente ou fraco (<16 chars). Webhook rejeitado. " +
          "Defina um secret forte ou ALLOW_INSECURE_WEBHOOKS=true apenas em localhost."
      );
      return false;
    }

    const provided = this.extractProvidedSecret(request);
    if (!provided) return false;
    return timingSafeStringEqual(provided, expected);
  }

  private validateSignature(request: FastifyRequest): boolean {
    const signature = request.headers["x-webhook-signature"] as
      | string
      | undefined;
    const rawBody = (request as RequestWithRawBody).rawBody;

    if (!signature || !rawBody) {
      if (allowInsecureWebhooks()) {
        request.log.warn(
          "ALLOW_INSECURE_WEBHOOKS=true — assinatura HMAC ausente ignorada."
        );
        return true;
      }
      return false;
    }

    const abacate = container.resolve<AbacatePayService>("AbacatePayService");
    return abacate.verifyWebhookSignature(rawBody, signature);
  }

  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!this.validateSecret(request)) {
      return reply.status(401).send({ message: "Secret inválido" });
    }
    if (!this.validateSignature(request)) {
      return reply.status(401).send({ message: "Assinatura inválida" });
    }

    const payload = request.body as IAbacateWebhookPayload;
    if (!payload || typeof payload !== "object") {
      return reply.status(200).send({ received: true });
    }

    const useCase = container.resolve(ProcessAbacateWebhookUseCase);
    try {
      await useCase.execute(payload);
      return reply.status(200).send({ received: true });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("DEV_MODE_REJECTED") || msg.includes("CHECKOUT_UNVERIFIED")) {
        request.log.warn({ err }, "Webhook AbacatePay rejeitado por política de segurança");
        return reply.status(400).send({ received: false, message: msg });
      }
      request.log.error(err, "Erro ao processar webhook AbacatePay");
      return reply.status(500).send({ received: false });
    }
  }
}
