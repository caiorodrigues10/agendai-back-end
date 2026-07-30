import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { randomUUID } from "node:crypto";
import { JoinQueueUseCase } from "./JoinQueueUseCase";
import { z } from "zod";
import { prisma } from "@/libs/prismaClient";
import { sendWhatsAppMessage } from "@/shared/services/whatsappNotificationService";

export class JoinQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const schema = z.object({
      barbershopId: z.string().uuid("barbershopId inválido"),
      serviceId: z.string().uuid("serviceId inválido"),
      customerName: z.string().min(2, "Nome obrigatório").max(200),
      whatsapp: z.string().min(8, "WhatsApp inválido").max(20),
      /** UUID persistido no localStorage do cliente (dedup na fila). */
      sessionId: z.string().uuid().optional(),
      addedByStaff: z.boolean().optional(),
    });

    const data = schema.parse(request.body);
    const isStaff = !!request.user;

    // Staff adiciona cliente com ID novo; visitante reutiliza sessionId se enviado.
    const customerId = isStaff ? randomUUID() : (data.sessionId ?? randomUUID());

    const useCase = container.resolve(JoinQueueUseCase);
    const item = await useCase.execute({
      barbershopId: data.barbershopId,
      serviceId: data.serviceId,
      customerName: data.customerName,
      whatsapp: data.whatsapp,
      customerId,
      addedByStaff: isStaff || data.addedByStaff,
    });

    if (!isStaff) {
      try {
        const shop = await prisma.barbershop.findUnique({
          where: { id: data.barbershopId },
          select: {
            whatsapp: true,
            name: true,
            evolutionInstanceName: true,
            services: { where: { id: data.serviceId }, select: { name: true } },
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
          await sendWhatsAppMessage(shop.whatsapp, msg, {
            instanceName: shop.evolutionInstanceName ?? undefined,
            log: request.log,
          });
        }
      } catch {
        /* notificação não bloqueia entrada na fila */
      }
    }

    return reply.status(201).send(item);
  }
}
