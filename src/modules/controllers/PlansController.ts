import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { createPlanSchema, updatePlanSchema } from "../plans/schemas/planSchemas"

export class PlansController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { all } = request.query as { all?: string };
    const onlyActive = all !== "true";

    const plans = await prisma.plan.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: { price: "asc" },
      select: {
        id: true, name: true, description: true, price: true,
        maxEmployees: true, features: true, active: true, createdAt: true
      }
    });

    return reply.send({ success: true, data: plans });
  }

  async get(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    const plan = await prisma.plan.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true, price: true,
        maxEmployees: true, features: true, active: true, createdAt: true
      }
    });

    if (!plan) throw new AppError("Plano não encontrado", 404);

    return reply.send({ success: true, data: plan });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createPlanSchema.parse(request.body);

    const plan = await prisma.plan.create({
      data,
      select: {
        id: true, name: true, description: true, price: true,
        maxEmployees: true, features: true, active: true, createdAt: true
      }
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: "CREATE_PLAN",
          resource: "Plan",
          resourceId: plan.id,
          details: JSON.stringify(data),
          ipAddress: request.ip
        }
      });
    }

    return reply.status(201).send({ success: true, data: plan });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const data = updatePlanSchema.parse(request.body);

    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new AppError("Plano não encontrado", 404);

    const plan = await prisma.plan.update({
      where: { id },
      data,
      select: {
        id: true, name: true, description: true, price: true,
        maxEmployees: true, features: true, active: true, createdAt: true
      }
    });

    return reply.send({ success: true, data: plan });
  }

  async deactivate(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new AppError("Plano não encontrado", 404);

    // Desativa o plano — ninguém novo pode assinar
    // mas quem já assinou continua até o endDate
    await prisma.plan.update({ where: { id }, data: { active: false } });

    // Conta quantas assinaturas ainda estão ativas nesse plano
    // só para informar o admin no retorno
    const activeCount = await prisma.subscription.count({
      where: {
        planId: id,
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] }
      }
    });

    return reply.send({
      success: true,
      message: "Plano desativado com sucesso.",
      data: {
        activeSubscriptionsRemaining: activeCount,
        info: activeCount > 0
          ? `${activeCount} barbearia(s) ainda usam este plano até o vencimento. Após isso precisarão assinar um novo.`
          : "Nenhuma barbearia ativa neste plano."
      }
    });
  }
}