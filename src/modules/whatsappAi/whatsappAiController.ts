import { FastifyRequest, FastifyReply } from "fastify";
import { processIncomingMessageSchema, listConversationsSchema, intentLogsSchema } from "./whatsappAiSchema";
import { WhatsAppAiUseCases } from "./whatsappAiUseCases";
import { AppError } from "@/shared/errors/AppError";

export class WhatsAppAiController {
  private useCases = new WhatsAppAiUseCases();

  async processIncoming(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const body = processIncomingMessageSchema.parse(request.body);

    const result = await this.useCases.processIncomingMessage(barbershopId, body.phone, body.content);
    reply.send({ success: true, data: result });
  }

  async listConversations(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = listConversationsSchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.listConversations(resolvedBarbershopId, query);
    reply.send({ success: true, data: result });
  }

  async getConversationDetail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.getConversationDetail(id, resolvedBarbershopId);
    reply.send({ success: true, data: result });
  }

  async getIntentLogs(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = intentLogsSchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.getIntentLogs(resolvedBarbershopId, query);
    reply.send({ success: true, data: result });
  }

  async getStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.getIntentStats(resolvedBarbershopId);
    reply.send({ success: true, data: result });
  }

  async transferToHuman(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.transferToHuman(id, resolvedBarbershopId);
    reply.send({ success: true, data: result });
  }
}
