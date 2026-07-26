import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListQueueUseCase } from "./ListQueueUseCase";
import { IQueueItemResponseDTO } from "../../dtos/IQueueItemResponseDTO";

/** Remove dados pessoais sensíveis para a visão pública da fila. */
function toPublicView(items: IQueueItemResponseDTO[]): IQueueItemResponseDTO[] {
  return items.map((item) => ({
    ...item,
    whatsapp: "",
    customerId: "",
  }));
}

export class ListQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { barbershopId } = request.query as { barbershopId?: string };
    const user = request.user;

    // ── Visão pública (cliente sem conta) ────────────────────────────────
    if (!user) {
      if (!barbershopId) {
        return reply.status(400).send({
          success: false,
          message: "Informe o barbershopId para consultar a fila"
        });
      }
      const listQueueUseCase = container.resolve(ListQueueUseCase);
      const queue = await listQueueUseCase.execute(barbershopId);
      return reply.status(200).send(toPublicView(queue));
    }

    // ── Visão staff/admin autenticada ────────────────────────────────────
    // Não-admins só podem ver a fila da própria barbearia
    if (user.role !== "MASTER_ADMIN" && !barbershopId) {
      const resolvedId = user.barbershopId;
      if (!resolvedId) {
        return reply.status(400).send({
          success: false,
          message: "Informe o barbershopId ou vincule seu usuário a um salão"
        });
      }
      const listQueueUseCase = container.resolve(ListQueueUseCase);
      const queue = await listQueueUseCase.execute(resolvedId);
      return reply.status(200).send(queue);
    }

    if (user.role !== "MASTER_ADMIN" && barbershopId && barbershopId !== user.barbershopId) {
      return reply.status(403).send({
        success: false,
        message: "Acesso negado: você não pertence a este salão"
      });
    }

    const listQueueUseCase = container.resolve(ListQueueUseCase);
    const queue = await listQueueUseCase.execute(barbershopId);
    return reply.status(200).send(queue);
  }
}
