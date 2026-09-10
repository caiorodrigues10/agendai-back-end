import { FastifyRequest, FastifyReply } from "fastify";
import { listSuggestionsSchema } from "./copilotSchema";
import { CopilotUseCases } from "./copilotUseCases";
import { AppError } from "@/shared/errors/AppError";

export class CopilotController {
  private useCases = new CopilotUseCases();

  async listSuggestions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = listSuggestionsSchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const suggestions = await this.useCases.listSuggestions(resolvedBarbershopId, query);
    reply.send({ success: true, data: suggestions });
  }

  async markRead(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const suggestion = await this.useCases.markRead(id, resolvedBarbershopId);
    reply.send({ success: true, data: suggestion });
  }

  async dismiss(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const suggestion = await this.useCases.dismiss(id, resolvedBarbershopId);
    reply.send({ success: true, data: suggestion });
  }

  async accept(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const suggestion = await this.useCases.accept(id, resolvedBarbershopId);
    reply.send({ success: true, data: suggestion });
  }

  async generate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.generateSuggestions(resolvedBarbershopId);
    reply.send({ success: true, data: result });
  }
}
