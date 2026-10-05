import { FastifyRequest, FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { adminUpdateBarbershopStatusSchema, adminCreateBarbershopSchema, adminListBarbershopsQuerySchema } from "../schemas/adminSchemas";
import { CreateShopWithOwnerUseCase } from "../useCases/shop/CreateShopWithOwnerUseCase";
import { hashInviteToken } from "@/shared/utils/tokenHash";
import { enqueueEmail } from "@/shared/infra/queue/emailQueue";
import { getFrontendUrl } from "@/shared/constants/env";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("admin:barbershops");
const INVITE_EXPIRES_HOURS = 72;

export class AdminBarbershopController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { page, limit, status, search } = adminListBarbershopsQuerySchema.parse(request.query);

    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = {};
    if (status === 'active') where.active = true;
    if (status === 'inactive') where.active = false;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cnpj: { contains: search } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [barbershops, total] = await Promise.all([
      prisma.barbershop.findMany({
        where, skip, take,
        select: {
          id: true, name: true, cnpj: true, whatsapp: true,
          address: true, active: true, approvalStatus: true, createdAt: true,
          _count: { select: { users: true, appointments: true, queue: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.barbershop.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: barbershops,
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
    });
  }

  async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const parsed = adminUpdateBarbershopStatusSchema.parse(request.body);
    const { active, approvalStatus, rejectionReason } = parsed;

    const barbershop = await prisma.barbershop.update({
      where: { id },
      data: {
        ...(active !== undefined && { active }),
        ...(approvalStatus && { approvalStatus }),
        ...(rejectionReason && { rejectionReason }),
      },
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE_BARBERSHOP_STATUS',
          resource: 'Barbershop',
          resourceId: id,
          details: JSON.stringify({ active, approvalStatus, rejectionReason }),
          ipAddress: request.ip,
          barbershopId: id,
        },
      });
    }

    return reply.status(200).send({ success: true, data: barbershop });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const parsed = adminCreateBarbershopSchema.parse(request.body);
    if (!request.user) throw new AppError("Não autenticado", 401);

    const useCase = container.resolve(CreateShopWithOwnerUseCase);
    const result = await useCase.execute(
      { id: request.user.id, ip: request.ip },
      parsed,
    );

    return reply.status(201).send({
      success: true,
      data: result.barbershop,
      owner: result.owner,
      subscription: result.subscription,
      inviteSent: result.inviteSent,
    });
  }

  /**
   * Reenvia o convite de dono: revoga o último token e gera outro novo.
   * Resposta nunca contém o token — ele só existe no link do e-mail.
   */
  async resendInvite(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    if (!request.user) throw new AppError("Não autenticado", 401);

    const latest = await prisma.ownerInvite.findFirst({
      where: { barbershopId: id },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) {
      throw new AppError("Nenhum convite encontrado para este salão", 404, undefined, "INVITE_NOT_FOUND");
    }
    if (latest.status === "ACCEPTED") {
      throw new AppError("Convite já aceito pelo dono", 409, undefined, "INVITE_ALREADY_ACCEPTED");
    }

    await prisma.ownerInvite.update({
      where: { id: latest.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    const rawInviteToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000);
    const created = await prisma.ownerInvite.create({
      data: {
        barbershopId: id,
        email: latest.email,
        invitedById: request.user.id,
        tokenHash: hashInviteToken(rawInviteToken),
        status: "PENDING",
        expiresAt,
      },
      select: { id: true, email: true, expiresAt: true },
    });

    const [shop, ownerUser] = await Promise.all([
      prisma.barbershop.findUnique({ where: { id }, select: { name: true } }),
      prisma.user.findFirst({
        where: { email: latest.email, barbershopId: id, deletedAt: null },
        select: { name: true },
      }),
    ]);

    let inviteSent = false;
    try {
      await enqueueEmail({
        kind: "owner_invite",
        ownerName: ownerUser?.name ?? latest.email.split("@")[0],
        barbershopName: shop?.name ?? "seu salão",
        email: latest.email,
        inviteUrl: `${getFrontendUrl()}/convite/${rawInviteToken}`,
        deduplicationKey: `owner-invite-resend-${created.id}`,
      });
      inviteSent = true;
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: "OWNER_INVITE_RESEND",
          resource: "OwnerInvite",
          resourceId: created.id,
          details: JSON.stringify({ barbershopId: id, email: latest.email }),
          ipAddress: request.ip,
          barbershopId: id,
        },
      });
    } catch (err) {
      logger.error({ err, barbershopId: id }, "Falha ao reenviar convite de dono");
    }

    return reply.status(200).send({ success: true, data: { inviteSent } });
  }
}