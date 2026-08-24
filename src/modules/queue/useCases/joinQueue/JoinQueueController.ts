import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { randomUUID } from "node:crypto";
import { JoinQueueUseCase } from "./JoinQueueUseCase";
import { z } from "zod";
import { prisma } from "@/libs/prismaClient";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { isQueueStaffForShop } from "../../utils/queueAccess";

export class JoinQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const schema = z.object({
      barbershopId: z.string().uuid("barbershopId inválido"),
      serviceId: z.string().uuid("serviceId inválido"),
      customerName: z.string().min(2, "Nome obrigatório").max(200),
      whatsapp: z.string().min(8, "WhatsApp inválido").max(20),
      /** UUID persistido no localStorage do cliente (dedup na fila). */
      sessionId: z.string().uuid().optional(),
      // addedByStaff do body é IGNORADO — derivado só de request.user
    });

    const data = schema.parse(request.body);
    const isStaff = isQueueStaffForShop(request.user, data.barbershopId);

    // Staff adiciona cliente com ID novo; visitante reutiliza sessionId se enviado.
    const customerId = isStaff
      ? randomUUID()
      : (data.sessionId ?? randomUUID());

    const useCase = container.resolve(JoinQueueUseCase);
    const item = await useCase.execute({
      barbershopId: data.barbershopId,
      serviceId: data.serviceId,
      customerName: data.customerName,
      whatsapp: data.whatsapp,
      customerId,
      addedByStaff: isStaff,
    });

    if (!isStaff) {
      try {
        const shop = await prisma.barbershop.findUnique({
          where: { id: data.barbershopId },
          select: {
            whatsapp: true,
            name: true,
            evolutionInstanceName: true,
            services: {
              where: { id: data.serviceId },
              select: { name: true },
            },
          },
        });
        if (shop?.whatsapp) {
          const serviceName = shop.services[0]?.name ?? "Serviço";
          const msg =
            `*Novo cliente na fila*\n\n` +
            `*${shop.name}*\n` +
            `Nome: ${data.customerName}\n` +
            `Serviço: ${serviceName}\n` +
            `Contato: ${data.whatsapp}`;
          await enqueueWhatsApp({
            phone: shop.whatsapp,
            message: msg,
            instanceName: shop.evolutionInstanceName ?? undefined,
            deduplicationKey: `join:${data.barbershopId}:${item.id}`,
          });
        }
      } catch {
        /* notificação não bloqueia entrada na fila */
      }
    }

    return reply.status(201).send(item);
  }
}
