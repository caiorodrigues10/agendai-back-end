import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getShopOpenState, listUpcomingExceptions } from "../../utils/getShopOpenState";
import { ymdInTimeZone } from "../../utils/shopOpenState";

const idSchema = z.string().uuid();
const manualStatusSchema = z.object({
  status: z.enum(["AUTO", "OPEN", "CLOSED"]),
});
const queueStatusSchema = z.object({
  closed: z.boolean(),
});

function assertShopAccess(request: FastifyRequest, barbershopId: string) {
  const user = request.user!;
  if (user.role !== "MASTER_ADMIN" && user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado", 403);
  }
}

async function shopPayload(barbershopId: string) {
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      id: true,
      openingMode: true,
      manualStatus: true,
      queueClosedAt: true,
      timezone: true,
    },
  });
  if (!shop) throw new AppError("Salão não encontrado", 404);
  const openState = await getShopOpenState(barbershopId);
  const today = ymdInTimeZone(new Date(), shop.timezone || "America/Sao_Paulo");
  const scheduleExceptions = await listUpcomingExceptions(barbershopId, today);
  return {
    id: shop.id,
    openingMode: shop.openingMode,
    manualStatus: shop.manualStatus,
    openState,
    scheduleExceptions,
  };
}

export class ShopStatusController {
  async setManualStatus(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = idSchema.parse((request.params as { id: string }).id);
    assertShopAccess(request, barbershopId);
    const { status } = manualStatusSchema.parse(request.body);
    await prisma.barbershop.update({
      where: { id: barbershopId },
      data: {
        manualStatus: status,
        manualStatusSetAt: status === "AUTO" ? null : new Date(),
      },
    });
    return reply.send({ success: true, data: await shopPayload(barbershopId) });
  }

  async setQueueStatus(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = idSchema.parse((request.params as { id: string }).id);
    assertShopAccess(request, barbershopId);
    const { closed } = queueStatusSchema.parse(request.body);
    await prisma.barbershop.update({
      where: { id: barbershopId },
      data: { queueClosedAt: closed ? new Date() : null },
    });
    return reply.send({ success: true, data: await shopPayload(barbershopId) });
  }
}
