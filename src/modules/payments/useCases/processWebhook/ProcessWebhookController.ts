import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ProcessWebhookUseCase } from "./ProcessWebhookUseCase";
import { IMercadoPagoWebhookDTO } from "../../dtos/IPaymentDTO";
import crypto from "node:crypto";
import { z } from "zod";

// Schema de validação do webhook para evitar crashes com payloads malformados
const webhookBodySchema = z.object({
  id:              z.number().optional(),
  live_mode:       z.boolean().optional(),
  type:            z.string(),
  date_created:    z.string().optional(),
  application_id:  z.number().optional(),
  user_id:         z.number().optional(),
  version:         z.number().optional(),
  api_version:     z.string().optional(),
  action:          z.string().optional(),
  data: z.object({
    // MP pode enviar id como string ou número — normalizamos para string
    id: z.union([z.string(), z.number()]).transform(String)
  })
});

export class ProcessWebhookController {
  private validateSignature(request: FastifyRequest): boolean {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const isProduction = process.env.NODE_ENV === "production";

    if (!secret) {
      if (isProduction) {
        // Em produção sem SECRET configurado: a aplicação está mal configurada.
        // Rejeitar toda requisição e alertar — nunca aceitar cegamente.
        request.log.error(
          "CRÍTICO: MERCADOPAGO_WEBHOOK_SECRET não está definido em produção. " +
          "Todas as requisições de webhook serão rejeitadas até a variável ser configurada."
        );
        return false;
      }

      // Em desenvolvimento: logar aviso e deixar passar para facilitar testes locais.
      request.log.warn(
        "MERCADOPAGO_WEBHOOK_SECRET não definido — validação de assinatura ignorada " +
        "(ambiente de desenvolvimento). Defina a variável antes de ir a produção."
      );
      return true;
    }

    // SECRET definido: validar assinatura HMAC-SHA256
    const signatureHeader = request.headers["x-signature"] as string | undefined;
    const requestId       = request.headers["x-request-id"] as string | undefined;

    if (!signatureHeader) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [k, v] = part.split("=");
        return [k.trim(), v?.trim() ?? ""];
      })
    );

    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;

    const rawBody = request.body as any;
    const dataId  = rawBody?.data?.id ?? "";
    const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    try {
      // timingSafeEqual evita timing attacks na comparação
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

    // Valida o body antes de processar — payload malformado não deve crashar
    const parseResult = webhookBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      request.log.warn(
        { errors: parseResult.error.errors },
        "Webhook payload inválido recebido"
      );
      // Retorna 200 mesmo assim: o MP não deve retentar por erro de schema nosso
      return reply.status(200).send({ received: true });
    }

    // Processa ANTES de responder: se falhar, devolve 500 e o MP reenvia o
    // webhook (retry automático). Responder 200 antes de processar causava
    // perda silenciosa de notificações de pagamento.
    const useCase = container.resolve(ProcessWebhookUseCase);
    try {
      await useCase.execute(parseResult.data as IMercadoPagoWebhookDTO);
      return reply.status(200).send({ received: true });
    } catch (err) {
      request.log.error(err, "Erro ao processar webhook do Mercado Pago");
      return reply.status(500).send({ received: false });
    }
  }
}
