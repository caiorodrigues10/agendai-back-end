import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { randomUUID } from "node:crypto";
import { JoinQueueUseCase } from "./JoinQueueUseCase";
import { z } from "zod";

export class JoinQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    // customerId NÃO vem do body — nunca confiar em ID fornecido pelo cliente.
    // Isso impede que qualquer pessoa forge o ID de outro usuário.
    const schema = z.object({
      barbershopId: z.string().uuid("barbershopId inválido"),
      serviceId:    z.string().uuid("serviceId inválido"),
      customerName: z.string().min(2, "Nome obrigatório").max(200),
      whatsapp:     z.string().min(8, "WhatsApp inválido").max(20),
      addedByStaff: z.boolean().optional()
    });

    const data = schema.parse(request.body);

    // Se autenticado (staff adicionando um cliente): usa o ID do usuário logado.
    // Se não autenticado (cliente entrando sozinho): gera UUID aleatório server-side.
    const customerId = request.user?.id ?? randomUUID();

    const useCase = container.resolve(JoinQueueUseCase);
    const item = await useCase.execute({ ...data, customerId });

    return reply.status(201).send(item);
  }
}
