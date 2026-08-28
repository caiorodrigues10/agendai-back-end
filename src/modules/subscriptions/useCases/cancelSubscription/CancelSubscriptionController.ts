import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { z } from "zod";
import { cancelSubscriptionForBarbershop } from "../../services/cancelSubscriptionService";

const cancelReasonSchema = z.object({
  cancelReason: z
    .enum([
      "price",
      "low_usage",
      "migrating",
      "missing_features",
      "technical_issues",
      "closing",
      "other",
    ])
    .optional(),
  pixKey: z.string().max(140).optional(),
  pixKeyType: z
    .enum(["CPF", "CNPJ", "PHONE", "EMAIL", "RANDOM", "BR_CODE"])
    .optional(),
});

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
      if (!user.barbershopId) throw new AppError("Usuário sem salão vinculado", 400);
      barbershopId = user.barbershopId;
    }

    const body = cancelReasonSchema.parse(request.body ?? {});

    const updated = await cancelSubscriptionForBarbershop(barbershopId, {
      cancelReason: body.cancelReason,
      pixKey: body.pixKey,
      pixKeyType: body.pixKeyType,
    });

    if (!updated) {
      throw new AppError("Nenhuma assinatura encontrada para este salão", 404);
    }

    if (updated.alreadyCanceled) {
      throw new AppError("Assinatura já está cancelada", 409);
    }

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: "CANCEL_SUBSCRIPTION",
          resource: "Subscription",
          resourceId: updated.id,
          details: JSON.stringify({ barbershopId, cancelReason: body.cancelReason ?? null }),
          ipAddress: request.ip
        }
      }).catch((err) => {
        request.log?.error({ err }, "Failed to audit CANCEL_SUBSCRIPTION");
      });
    }

    return reply.send({
      success: true,
      message: `Assinatura do plano "${updated.plan?.name}" cancelada com sucesso.`,
      data: {
        id: updated.id,
        status: updated.status,
        cancelDate: updated.cancelDate,
        cancelReason: updated.cancelReason,
        endDate: updated.endDate,
        proratedRefund: updated.proratedRefund,
      }
    });
  }
}