import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ProcessWebhookUseCase } from "./ProcessWebhookUseCase";
import { IMercadoPagoWebhookDTO } from "../../dtos/IPaymentDTO";
import crypto from "node:crypto";

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

    const { data } = request.body as IMercadoPagoWebhookDTO;
    const manifest = `id:${data.id};request-id:${requestId};ts:${ts};`;

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

    reply.status(200).send({ received: true });

    const useCase = container.resolve(ProcessWebhookUseCase);
    useCase
      .execute(request.body as IMercadoPagoWebhookDTO)
      .catch(() => { /* MP vai retentar */ });
  }
}
