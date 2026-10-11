import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { DeleteQueueItemUseCase } from "./DeleteQueueItemUseCase";

export class DeleteQueueItemController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      throw new AppError("Não autenticado", 401);
    }

    const { id } = request.params as { id: string };
    // Motivo do arquivamento é opcional (auditoria). Body em DELETE é aceito
    // pelo Fastify; ausente/vazio segue como null.
    const body = (request.body ?? undefined) as { reason?: unknown } | undefined;
    const reason =
      typeof body?.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 200)
        : null;
    const useCase = container.resolve(DeleteQueueItemUseCase);
    await useCase.execute(id, user, reason);
    return reply.status(204).send();
  }
}
