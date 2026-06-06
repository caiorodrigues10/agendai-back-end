import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

export class CancelSubscriptionController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;

    if (user.role === "EMPLOYEE") {
      throw new AppError("Apenas proprietários podem cancelar assinaturas", 403);
    }

    let barbershopId: string;

    if (user.role === "MASTER_ADMIN") {
      const { barbershopId: paramId } = request.params as { barbershopId?: string };
      barbershopId = paramId ?? "";
      if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);
    } else {
      if (!user.barbershopId) throw new AppError("Usuário sem barbearia vinculada", 400);
      barbershopId = user.barbershopId;
    }

    const subscription = await prisma.subscription.findUnique({
      where: { barbershopId }
    });

    if (!subscription) {
      throw new AppError("Nenhuma assinatura encontrada para esta barbearia", 404);
    }

    if (subscription.status === "CANCELED") {
      throw new AppError("Assinatura já está cancelada", 409);
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELED", cancelDate: new Date() },
      include: { plan: true }
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: "CANCEL_SUBSCRIPTION",
          resource: "Subscription",
          resourceId: subscription.id,
          details: JSON.stringify({ barbershopId }),
          ipAddress: request.ip
        }
      });
    }

    return reply.send({
      success: true,
      message: `Assinatura do plano "${updated.plan.name}" cancelada com sucesso.`,
      data: { id: updated.id, status: updated.status, cancelDate: updated.cancelDate }
    });
  }
}