import { FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { container } from "tsyringe";
import {
  IAsaasWebhookPayload,
  ProcessAsaasWebhookUseCase,
} from "./ProcessAsaasWebhookUseCase";

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Só permite bypass local explícito (nunca por NODE_ENV=development sozinho).
 * Staging/produção devem sempre exigir o token.
 */
function allowInsecureWebhooks(): boolean {
  return process.env.ALLOW_INSECURE_WEBHOOKS === "true";
}

/**
 * Autenticação do webhook Asaas: header `asaas-access-token` com o token
 * configurado no painel (32–255 chars, NÃO pode ser a API Key).
 * @see https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook
 */
export class ProcessAsaasWebhookController {
  private validateToken(request: FastifyRequest): boolean {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;

    if (!expected || expected.trim().length < 32) {
      if (allowInsecureWebhooks()) {
        request.log.warn(
          "ALLOW_INSECURE_WEBHOOKS=true — token Asaas não exigido (somente local)."
        );
        return true;
      }
      request.log.error(
        "ASAAS_WEBHOOK_TOKEN ausente ou fraco (<32 chars). Webhook rejeitado. " +
          "Defina um token forte (gerado no painel Asaas) ou ALLOW_INSECURE_WEBHOOKS=true apenas em localhost."
      );
      return false;
    }

    const provided = request.headers["asaas-access-token"];
    if (typeof provided !== "string" || provided.length === 0) return false;
    return timingSafeStringEqual(provided, expected);
  }

  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!this.validateToken(request)) {
      return reply.status(401).send({ message: "Token inválido" });
    }

    const payload = request.body as IAsaasWebhookPayload;
    if (!payload || typeof payload !== "object") {
      return reply.status(200).send({ received: true });
    }

    const useCase = container.resolve(ProcessAsaasWebhookUseCase);
    try {
      await useCase.execute(payload);
      return reply.status(200).send({ received: true });
    } catch (err: any) {
      request.log.error(err, "Erro ao processar webhook Asaas");
      return reply.status(500).send({ received: false });
    }
  }
}