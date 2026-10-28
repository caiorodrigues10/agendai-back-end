import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { AppError } from "@/shared/errors/AppError";
import { SetShopStatusUseCase } from "./SetShopStatusUseCase";

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

export class ShopStatusController {
  private useCases = new SetShopStatusUseCase();

  async setManualStatus(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = idSchema.parse((request.params as { id: string }).id);
    assertShopAccess(request, barbershopId);
    const { status } = manualStatusSchema.parse(request.body);
    const data = await this.useCases.execute(barbershopId, { status }, request.user);
    return reply.send({ success: true, data });
  }

  async setQueueStatus(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = idSchema.parse((request.params as { id: string }).id);
    assertShopAccess(request, barbershopId);
    const { closed } = queueStatusSchema.parse(request.body);
    const data = await this.useCases.execute(barbershopId, { closed }, request.user);
    return reply.send({ success: true, data });
  }
}
