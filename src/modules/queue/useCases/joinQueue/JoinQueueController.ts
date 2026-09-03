import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { randomUUID } from "node:crypto";
import { JoinQueueUseCase } from "./JoinQueueUseCase";
import { z } from "zod";
import { prisma } from "@/libs/prismaClient";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { isQueueStaffForShop } from "../../utils/queueAccess";
import {
  isPlaceholderWhatsApp,
  resolveQueueWhatsApp,
} from "../../utils/queueDuplicate";
import { notifyQueueCapacity } from "../../services/queueCapacityAlert";

export class JoinQueueController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const schema = z.object({
      barbershopId: z.string().uuid("barbershopId inválido"),
      serviceId: z.string().uuid("serviceId inválido"),
      customerName: z.string().min(2, "Nome obrigatório").max(200),
      whatsapp: z.string().max(20).optional().default(""),
      /** UUID persistido no localStorage do cliente (dedup na fila). */
      sessionId: z.string().uuid().optional(),
      /** Sessão local do responsável quando a entrada é de um dependente. */
      responsibleSessionId: z.string().uuid().optional(),
      // addedByStaff do body é IGNORADO — derivado só de request.user
    });

    const data = schema.parse(request.body);
    const isStaff = isQueueStaffForShop(request.user, data.barbershopId);

    const responsible = data.responsibleSessionId
      ? await prisma.queueItem.findFirst({
          where: {
            barbershopId: data.barbershopId,
            customerId: data.responsibleSessionId,
            status: { in: ["WAITING", "IN_CHAIR"] },
            responsibleQueueItemId: null,
          },
          orderBy: { joinedAt: "desc" },
          select: { id: true, whatsapp: true },
        })
      : null;

    if (data.responsibleSessionId && !responsible) {
      return reply.status(400).send({
        success: false,
        message: "O responsável precisa estar na fila para adicionar um dependente",
      });
    }

    // Telefone próprio é opcional para dependente; nesse caso, herdamos o contato do responsável.
    const whatsapp = resolveQueueWhatsApp(
      data.whatsapp.trim() || responsible?.whatsapp || ""
    );

    // Staff adiciona cliente com ID novo; visitante reutiliza sessionId se enviado.
    const customerId = isStaff
      ? randomUUID()
      : (data.sessionId ?? randomUUID());

    const useCase = container.resolve(JoinQueueUseCase);
    const item = await useCase.execute({
      barbershopId: data.barbershopId,
      serviceId: data.serviceId,
      customerName: data.customerName,
      whatsapp,
      customerId,
      addedByStaff: isStaff,
      responsibleQueueItemId: responsible?.id,
    });

    // Cliente recebe confirmação no JoinQueueUseCase. O salão só é avisado
    // quando o próprio cliente entra (não quando o staff adiciona).

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
        if (shop?.whatsapp && shop.evolutionInstanceName?.trim()) {
          const serviceName = shop.services[0]?.name ?? "Serviço";
          const msg =
            `*Novo cliente na fila*\n\n` +
            `*${shop.name}*\n` +
            `Nome: ${data.customerName}\n` +
            `Serviço: ${serviceName}\n` +
            `Contato: ${isPlaceholderWhatsApp(whatsapp) ? "não informado" : whatsapp}`;
          await enqueueWhatsApp({
            phone: shop.whatsapp,
            message: msg,
            instanceName: shop.evolutionInstanceName?.trim() || undefined,
            deduplicationKey: `join:${data.barbershopId}:${item.id}`,
            notificationType: "QUEUE_JOINED_SHOP_ALERT",
            barbershopId: data.barbershopId,
            sourceType: "QUEUE_ITEM",
            sourceId: item.id,
          });
        }
      } catch {
        /* notificação não bloqueia entrada na fila */
      }
    }

    try { await notifyQueueCapacity(data.barbershopId, item.id, data.customerName); } catch { /* alerta não bloqueia a entrada */ }

    return reply.status(201).send(item);
  }
}
