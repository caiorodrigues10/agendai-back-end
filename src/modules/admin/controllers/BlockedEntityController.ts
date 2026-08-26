import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { blockEntity, unblockEntity } from "@/shared/services/blockedEntityService";
import { isValidCpf } from "@/shared/utils/cpfUtils";
import { blockSchema } from "../schemas/blockedEntitySchemas";
import { adminListBlockedEntitiesQuerySchema } from "../schemas/adminSchemas";

export class BlockedEntityAdminController {
  /** GET /admin/blocked-entities */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { page, limit, type, isActive, search } = adminListBlockedEntitiesQuerySchema.parse(request.query);

    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = {};
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (search) {
      where.OR = [
        { value: { contains: search } },
        { reason: { contains: search, mode: "insensitive" } }
      ];
    }

    const [data, total] = await Promise.all([
      prisma.blockedEntity.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" }
      }),
      prisma.blockedEntity.count({ where })
    ]);

    return reply.send({
      success: true,
      data,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take)
      }
    });
  }

  /** GET /admin/blocked-entities/:id */
  async get(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const entity = await prisma.blockedEntity.findUnique({ where: { id } });
    if (!entity) throw new AppError("Registro de bloqueio não encontrado", 404);
    return reply.send({ success: true, data: entity });
  }

  /** POST /admin/blocked-entities */
  async block(request: FastifyRequest, reply: FastifyReply) {
    const body = blockSchema.parse(request.body);
    const adminId = request.user!.id;

    if (body.type === "CPF" && !isValidCpf(body.value)) {
      throw new AppError("CPF inválido (dígitos verificadores incorretos)", 400);
    }

    const result = await blockEntity({
      type: body.type,
      value: body.value,
      reason: body.reason,
      barbershopId: body.barbershopId,
      blockedBy: adminId,
      idempotent: false
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "ADMIN_BLOCK_ENTITY",
        resource: "BlockedEntity",
        resourceId: result.id,
        details: JSON.stringify({ type: body.type, value: body.value, reason: body.reason }),
        ipAddress: request.ip
      }
    });

    return reply.status(201).send({ success: true, data: result });
  }

  /** DELETE /admin/blocked-entities/:id */
  async unblock(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const adminId = request.user!.id;

    const entity = await prisma.blockedEntity.findUnique({ where: { id } });
    if (!entity) throw new AppError("Registro de bloqueio não encontrado", 404);
    if (!entity.isActive) throw new AppError("Entidade já está desbloqueada", 409);

    const result = await unblockEntity({
      type: entity.type,
      value: entity.value,
      unblockedBy: adminId
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "ADMIN_UNBLOCK_ENTITY",
        resource: "BlockedEntity",
        resourceId: id,
        details: JSON.stringify({ type: entity.type, value: entity.value }),
        ipAddress: request.ip
      }
    });

    return reply.send({ success: true, data: result });
  }
}

