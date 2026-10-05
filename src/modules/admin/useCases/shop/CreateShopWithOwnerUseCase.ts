import { inject, injectable } from "tsyringe";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { prisma, Prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { seedBarbershopDefaults } from "@/shared/utils/seedBarbershopDefaults";
import { hashInviteToken } from "@/shared/utils/tokenHash";
import { checkCnpjAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { enqueueEmail } from "@/shared/infra/queue/emailQueue";
import { getFrontendUrl } from "@/shared/constants/env";
import { TRIAL_DAYS } from "@/shared/constants/subscription";
import { getModuleLogger } from "@/shared/utils/logger";
import type { adminCreateBarbershopSchema } from "../../schemas/adminSchemas";

const logger = getModuleLogger("admin:create-shop-owner");
const INVITE_EXPIRES_HOURS = 72;

export type CreateShopWithOwnerInput = z.infer<typeof adminCreateBarbershopSchema>;

export interface CreateShopWithOwnerResult {
  barbershop: Record<string, unknown>;
  owner?: { id: string; email: string };
  subscription?: { planId: string; status: string; trialEnd: Date };
  inviteSent: boolean;
}

/**
 * Assistente "Novo salão" do master: cria salão + dono + assinatura de trial
 * em UMA transação. O e-mail de convite é enfileirado só depois do commit
 * (falha de e-mail não desfaz a criação — o master pode reenviar pelo detalhe
 * da conta). O token bruto nunca é persistido nem logado: só o hash SHA-256.
 */
@injectable()
export class CreateShopWithOwnerUseCase {
  constructor(
    @inject("HashProvider")
    private hashProvider: IHashProvider,
  ) {}

  async execute(
    actor: { id: string; ip?: string },
    data: CreateShopWithOwnerInput,
  ): Promise<CreateShopWithOwnerResult> {
    const {
      name,
      whatsapp,
      cnpj,
      address,
      active = true,
      owner,
      planId,
      trialDays,
    } = data;

    if (cnpj) await checkCnpjAccess(cnpj);

    if (owner) {
      const emailTaken = await prisma.user.findFirst({
        where: { email: owner.email, deletedAt: null },
        select: { id: true },
      });
      if (emailTaken) {
        throw new AppError("Já existe um usuário com este e-mail", 409, undefined, "EMAIL_ALREADY_EXISTS");
      }
    }

    let plan: { id: string } | null = null;
    if (planId) {
      plan = await prisma.plan.findFirst({
        where: { id: planId, active: true },
        select: { id: true },
      });
      if (!plan) {
        throw new AppError("Plano não encontrado ou inativo", 400, undefined, "PLAN_NOT_AVAILABLE");
      }
    }

    // Hash do placeholder é calculado fora da transação (custoso).
    const ownerPasswordHash = owner
      ? await this.hashProvider.hash(randomBytes(32).toString("hex"))
      : null;
    const rawInviteToken = owner ? randomBytes(32).toString("hex") : null;
    const inviteExpiresAt = new Date(Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000);
    const normalizedWhatsapp = whatsapp.replace(/\D/g, "") || whatsapp;

    const created = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const shop = await tx.barbershop.create({
          data: {
            name,
            whatsapp: normalizedWhatsapp,
            cnpj: cnpj ?? null,
            address: address ?? null,
            active,
            approvalStatus: "APPROVED",
          },
        });

        await seedBarbershopDefaults(tx, shop.id);

        let ownerId: string | undefined;
        if (owner && ownerPasswordHash && rawInviteToken) {
          const ownerUser = await tx.user.create({
            data: {
              name: owner.name,
              email: owner.email,
              password: ownerPasswordHash,
              role: "OWNER",
              barbershopId: shop.id,
              active,
              emailVerified: false,
            },
          });
          ownerId = ownerUser.id;
          await tx.ownerInvite.create({
            data: {
              barbershopId: shop.id,
              email: owner.email,
              invitedById: actor.id,
              tokenHash: hashInviteToken(rawInviteToken),
              status: "PENDING",
              expiresAt: inviteExpiresAt,
            },
          });
        }

        let trialEnd: Date | undefined;
        if (plan) {
          trialEnd = new Date(Date.now() + (trialDays ?? TRIAL_DAYS) * 24 * 60 * 60 * 1000);
          await tx.subscription.create({
            data: {
              barbershopId: shop.id,
              planId: plan.id,
              status: "TRIALING",
              startDate: new Date(),
              endDate: trialEnd,
            },
          });
        }

        return { shop, ownerId, trialEnd };
      },
      { timeout: 30_000 },
    );

    const { shop, ownerId, trialEnd } = created;

    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: "CREATE_BARBERSHOP",
        resource: "Barbershop",
        resourceId: shop.id,
        details: JSON.stringify({ name, whatsapp, cnpj }),
        ipAddress: actor.ip,
        barbershopId: shop.id,
      },
    });
    if (ownerId && owner) {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: "CREATE_SHOP_OWNER",
          resource: "User",
          resourceId: ownerId,
          details: JSON.stringify({ ownerId, email: owner.email, barbershopId: shop.id }),
          ipAddress: actor.ip,
          barbershopId: shop.id,
        },
      });
    }
    if (plan && trialEnd) {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: "CREATE_SHOP_SUBSCRIPTION",
          resource: "Subscription",
          resourceId: shop.id,
          details: JSON.stringify({ planId: plan.id, status: "TRIALING", trialEnd: trialEnd.toISOString() }),
          ipAddress: actor.ip,
          barbershopId: shop.id,
        },
      });
    }

    // Falha no e-mail não desfaz a criação: `inviteSent=false` + reenvio no detalhe.
    let inviteSent = false;
    if (owner && ownerId && rawInviteToken) {
      try {
        await enqueueEmail({
          kind: "owner_invite",
          ownerName: owner.name,
          barbershopName: shop.name,
          email: owner.email,
          inviteUrl: `${getFrontendUrl()}/convite/${rawInviteToken}`,
          deduplicationKey: `owner-invite-${shop.id}`,
        });
        inviteSent = true;
        await prisma.auditLog.create({
          data: {
            userId: actor.id,
            action: "OWNER_INVITE_SEND",
            resource: "OwnerInvite",
            resourceId: shop.id,
            details: JSON.stringify({ ownerId, barbershopId: shop.id }),
            ipAddress: actor.ip,
            barbershopId: shop.id,
          },
        });
      } catch (err) {
        logger.error({ err, barbershopId: shop.id, ownerId }, "Falha ao enfileirar convite de dono");
      }
    }

    try {
      await prisma.adminNotification.create({
        data: {
          type: "ACCOUNT_ACTION",
          title: `Novo salão: ${shop.name}`,
          message: owner
            ? `Salão criado com dono ${owner.email}${inviteSent ? " (convite enviado)" : " (convite não enviado — reenviar pelo detalhe)"}.`
            : "Salão criado sem dono vinculado.",
          metadata: JSON.stringify({ barbershopId: shop.id, ownerId: ownerId ?? null, inviteSent }),
        },
      });
    } catch (err) {
      logger.warn({ err, barbershopId: shop.id }, "Falha ao criar notificação de novo salão");
    }

    return {
      barbershop: shop as unknown as Record<string, unknown>,
      owner: ownerId && owner ? { id: ownerId, email: owner.email } : undefined,
      subscription: plan && trialEnd ? { planId: plan.id, status: "TRIALING", trialEnd } : undefined,
      inviteSent,
    };
  }
}
