import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { WhatsAppConnectionUseCase } from "./WhatsAppConnectionUseCase";

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
    const data = await useCase.connect(id, request.user!);
    reply.send({ success: true, data });
  }

  async disconnect(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(WhatsAppConnectionUseCase);
    const data = await useCase.disconnect(id, request.user!);
    reply.send({ success: true, data });
  }
}
