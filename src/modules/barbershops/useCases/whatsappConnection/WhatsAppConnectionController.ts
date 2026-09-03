import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { WhatsAppConnectionUseCase } from "./WhatsAppConnectionUseCase";
import { z } from "zod";

const connectSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("qr") }),
  z.object({ method: z.literal("pairing_code"), phoneNumber: z.string().min(10).max(20) }),
]);

export class WhatsAppConnectionController {
  async status(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(WhatsAppConnectionUseCase);
    const data = await useCase.status(id, request.user!);
    reply.send({ success: true, data });
  }

  async connect(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(WhatsAppConnectionUseCase);
    const body = request.body && typeof request.body === "object" && Object.keys(request.body as object).length
      ? connectSchema.parse(request.body)
      : { method: "qr" as const };
    const data = await useCase.connect(id, request.user!, body);
    reply.send({ success: true, data });
  }

  async disconnect(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(WhatsAppConnectionUseCase);
    const data = await useCase.disconnect(id, request.user!);
    reply.send({ success: true, data });
  }
}
