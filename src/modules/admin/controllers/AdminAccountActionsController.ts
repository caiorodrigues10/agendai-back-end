import { FastifyRequest, FastifyReply } from "fastify";
import { sign, Secret } from "jsonwebtoken";
import { prisma, Prisma } from "@/libs/prismaClient";
import auth from "@/config/auth";
import { AppError } from "@/shared/errors/AppError";
import {
  adminAccountIdParamsSchema,
  adminAccountReasonSchema,
  adminAccountExtendTrialSchema,
  adminAccountChangePlanSchema,
} from "../schemas/adminAccountsSchemas";

const IMPERSONATION_TTL_SECONDS = 30 * 60;
const DAY_MS = 86_400_000;

type ImpressionSnap = { active?: boolean; approvalStatus?: string; endDate?: string | null; planId?: string };

/**
 * Ações de controle do master sobre uma conta (salão).
 * Toda ação exige motivo ≥10 caracteres, grava AuditLog com antes/depois + IP
 * e, quando crítica, cria AdminNotification (ACCOUNT_ACTION).
 */
export class AdminAccountActionsController {
  private async loadShop(id: string) {
    const shop = await prisma.barbershop.findUnique({ where: { id } });
    if (!shop) throw new AppError("Conta não encontrada", 404);
    return shop;
  }

  private async audit(
    request: FastifyRequest,
    action: string,
    shopId: string,
    reason: string,
    before: ImpressionSnap | null,
    after: ImpressionSnap | null,
  ) {
    if (!request.user) return;
    await prisma.auditLog.create({
      data: {
        userId: request.user.id,
        action,
        resource: "Barbershop",
        resourceId: shopId,
        details: JSON.stringify({ reason, before, after }),
        ipAddress: request.ip,
        barbershopId: shopId,
      },
    });
  }

  private async notify(title: string, message: string, shopId: string, action: string) {
    await prisma.adminNotification.create({
      data: {
        type: "ACCOUNT_ACTION",
        title: title.slice(0, 200),
        message: message.slice(0, 2000),
        metadata: JSON.stringify({ shopId, action }),
      },
    });
  }

  private idAndReason(request: FastifyRequest) {
    const { id } = adminAccountIdParamsSchema.parse(request.params);
    const { reason } = adminAccountReasonSchema.parse(request.body);
    return { id, reason };
  }

  async suspend(request: FastifyRequest, reply: FastifyReply) {
    const { id, reason } = this.idAndReason(request);
    const shop = await this.loadShop(id);
    if (!shop.active) throw new AppError("Conta já está suspensa", 409);

    await prisma.barbershop.update({ where: { id }, data: { active: false } });
    await this.audit(request, "ACCOUNT_SUSPEND", id, reason, { active: true }, { active: false });
    await this.notify(`Conta suspensa — ${shop.name}`, reason, id, "suspend");
    return reply.status(200).send({ success: true, data: { id, active: false } });
  }

  async reactivate(request: FastifyRequest, reply: FastifyReply) {
    const { id, reason } = this.idAndReason(request);
    const shop = await this.loadShop(id);
    if (shop.active) throw new AppError("Conta já está ativa", 409);

    await prisma.barbershop.update({ where: { id }, data: { active: true } });
    await this.audit(request, "ACCOUNT_REACTIVATE", id, reason, { active: false }, { active: true });
    return reply.status(200).send({ success: true, data: { id, active: true } });
  }

  async approve(request: FastifyRequest, reply: FastifyReply) {
    const { id, reason } = this.idAndReason(request);
    const shop = await this.loadShop(id);
    if (shop.approvalStatus === "APPROVED") throw new AppError("Conta já está aprovada", 409);

    await prisma.barbershop.update({
      where: { id },
      data: { approvalStatus: "APPROVED", rejectionReason: null },
    });
    await this.audit(
      request,
      "ACCOUNT_APPROVE",
      id,
      reason,
      { approvalStatus: shop.approvalStatus },
      { approvalStatus: "APPROVED" },
    );
    return reply.status(200).send({ success: true, data: { id, approvalStatus: "APPROVED" } });
  }

  async reject(request: FastifyRequest, reply: FastifyReply) {
    const { id, reason } = this.idAndReason(request);
    const shop = await this.loadShop(id);
    if (shop.approvalStatus === "REJECTED") throw new AppError("Conta já está rejeitada", 409);

    await prisma.barbershop.update({
      where: { id },
      data: { approvalStatus: "REJECTED", rejectionReason: reason },
    });
    await this.audit(
      request,
      "ACCOUNT_REJECT",
      id,
      reason,
      { approvalStatus: shop.approvalStatus },
      { approvalStatus: "REJECTED" },
    );
    await this.notify(`Conta rejeitada — ${shop.name}`, reason, id, "reject");
    return reply.status(200).send({ success: true, data: { id, approvalStatus: "REJECTED" } });
  }

  async extendTrial(request: FastifyRequest, reply: FastifyReply) {
    const { id } = adminAccountIdParamsSchema.parse(request.params);
    const { reason, days } = adminAccountExtendTrialSchema.parse(request.body);
    const shop = await this.loadShop(id);

    const subscription = await prisma.subscription.findUnique({ where: { barbershopId: id } });
    if (!subscription) throw new AppError("Salão sem assinatura registrada", 409);
    if (subscription.status !== "TRIALING") {
      throw new AppError("Só é possível estender assinaturas em trial", 409);
    }

    const base = subscription.endDate && subscription.endDate > new Date() ? subscription.endDate : new Date();
    const newEnd = new Date(base.getTime() + days * DAY_MS);
    await prisma.subscription.update({ where: { id: subscription.id }, data: { endDate: newEnd } });
    await this.audit(
      request,
      "ACCOUNT_EXTEND_TRIAL",
      id,
      reason,
      { endDate: subscription.endDate?.toISOString() ?? null },
      { endDate: newEnd.toISOString() },
    );
    await this.notify(`Trial estendido — ${shop.name}`, `${reason} (+${days} dias)`, id, "extend-trial");
    return reply.status(200).send({ success: true, data: { id, endDate: newEnd.toISOString() } });
  }

  async changePlan(request: FastifyRequest, reply: FastifyReply) {
    const { id } = adminAccountIdParamsSchema.parse(request.params);
    const { reason, planId } = adminAccountChangePlanSchema.parse(request.body);
    const shop = await this.loadShop(id);

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.active) throw new AppError("Plano indisponível", 400);

    const subscription = await prisma.subscription.findUnique({ where: { barbershopId: id } });
    if (!subscription) throw new AppError("Salão sem assinatura registrada", 409);
    if (subscription.planId === planId) throw new AppError("Salão já está neste plano", 409);

    await prisma.subscription.update({ where: { id: subscription.id }, data: { planId } });
    await this.audit(
      request,
      "ACCOUNT_CHANGE_PLAN",
      id,
      reason,
      { planId: subscription.planId },
      { planId },
    );
    await this.notify(`Plano alterado — ${shop.name}`, `${reason} (plano: ${plan.name})`, id, "change-plan");
    return reply.status(200).send({ success: true, data: { id, planId, planName: plan.name } });
  }

  async block(request: FastifyRequest, reply: FastifyReply) {
    const { id, reason } = this.idAndReason(request);
    const shop = await this.loadShop(id);
    if (!shop.cnpj) {
      throw new AppError("Salão sem CNPJ — use Suspender para inativar a conta", 400);
    }

    const cnpj = shop.cnpj;
    const userId = request.user?.id;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.barbershop.update({
        where: { id },
        data: { active: false, approvalStatus: "REJECTED", rejectionReason: reason },
      });
      const existing = await tx.blockedEntity.findFirst({
        where: { type: "CNPJ", value: cnpj, isActive: true },
      });
      if (!existing) {
        await tx.blockedEntity.create({
          data: {
            type: "CNPJ",
            value: cnpj,
            reason: reason.slice(0, 500),
            barbershopId: id,
            blockedBy: userId,
          },
        });
      }
    });

    await this.audit(
      request,
      "ACCOUNT_BLOCK",
      id,
      reason,
      { active: shop.active, approvalStatus: shop.approvalStatus },
      { active: false, approvalStatus: "REJECTED" },
    );
    await this.notify(`Conta bloqueada — ${shop.name}`, reason, id, "block");
    return reply.status(200).send({ success: true, data: { id, active: false, cnpj } });
  }

  async notifyOwner(request: FastifyRequest, reply: FastifyReply) {
    const { id, reason } = this.idAndReason(request);
    const shop = await this.loadShop(id);

    await prisma.adminNotification.create({
      data: {
        type: "ACCOUNT_ACTION",
        title: `Comunicado — ${shop.name}`.slice(0, 200),
        message: reason.slice(0, 2000),
        metadata: JSON.stringify({ shopId: id, action: "notify" }),
      },
    });
    await this.audit(request, "ACCOUNT_NOTIFY", id, reason, null, null);
    return reply.status(201).send({ success: true, data: { id, notified: true } });
  }

  async impersonate(request: FastifyRequest, reply: FastifyReply) {
    const { id, reason } = this.idAndReason(request);
    const shop = await this.loadShop(id);
    if (!shop.active) throw new AppError("Conta inativa não pode ser acessada", 409);

    const owner = await prisma.user.findFirst({
      where: { barbershopId: id, role: "OWNER", active: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (!owner) throw new AppError("Sem dono ativo para acessar esta conta", 409);
    if (owner.role === "MASTER_ADMIN") throw new AppError("Acesso ao master nunca é impersonado", 409);

    const accessToken = sign(
      {
        role: owner.role,
        barbershopId: owner.barbershopId ?? undefined,
        imp: true,
        impBy: request.user?.id,
      },
      auth.secret as Secret,
      { subject: owner.id, expiresIn: IMPERSONATION_TTL_SECONDS },
    );

    await this.audit(request, "ACCOUNT_IMPERSONATE", id, reason, null, null);
    await this.notify(`Acesso temporário — ${shop.name}`, reason, id, "impersonate");

    return reply.status(200).send({
      success: true,
      data: {
        accessToken,
        expiresIn: IMPERSONATION_TTL_SECONDS,
        user: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          role: owner.role,
          barbershopId: owner.barbershopId ?? undefined,
          avatarUrl: owner.avatarUrl ?? undefined,
        },
        shop: { id: shop.id, name: shop.name },
      },
    });
  }
}
