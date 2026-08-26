import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { container } from "tsyringe";
import { CreateBarbershopUseCase } from "@/modules/barbershops/useCases/createBarbershop/CreateBarbershopUseCase";
import { adminUpdateBarbershopStatusSchema, adminCreateBarbershopSchema } from "../schemas/adminSchemas";

export class AdminBarbershopController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { page = 1, limit = 10, status, search } = request.query as any;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

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
      meta: { total, page: Number(page), limit: take, totalPages: Math.ceil(total / take) },
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
        },
      });
    }

    return reply.status(200).send({ success: true, data: barbershop });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const parsed = adminCreateBarbershopSchema.parse(request.body);
    const { name, whatsapp, cnpj, address, active = true } = parsed;

    // Usa o UseCase para garantir que checkCnpjAccess() seja executado
    const useCase = container.resolve(CreateBarbershopUseCase);
    const barbershopData = await useCase.execute({ name, whatsapp, cnpj });

    // Aplica campos extras que só o admin pode definir (address, active, approvalStatus)
    const barbershop = await prisma.barbershop.update({
      where: { id: barbershopData.id },
      data: { address, active, approvalStatus: 'APPROVED' },
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE_BARBERSHOP',
          resource: 'Barbershop',
          resourceId: barbershop.id,
          details: JSON.stringify({ name, whatsapp, cnpj }),
          ipAddress: request.ip,
        },
      });
    }

    return reply.status(201).send({ success: true, data: barbershop });
  }
}