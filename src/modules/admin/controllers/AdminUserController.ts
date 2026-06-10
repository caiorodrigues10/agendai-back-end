import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { hash } from "bcryptjs";
import { isValidCpf, normalizeCpf } from "@/shared/utils/cpfUtils";

export class AdminUserController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { page = 1, limit = 10, role, search, active, barbershopId } = request.query as any;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};
    if (role) where.role = role;
    if (active !== undefined) where.active = active === 'true';
    if (barbershopId) where.barbershopId = barbershopId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take,
        select: {
          id: true, name: true, email: true, role: true,
          active: true, barbershopId: true, cpf: true, createdAt: true,
          barbershop: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: users,
      meta: { total, page: Number(page), limit: take, totalPages: Math.ceil(total / take) },
    });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { name, email, password, role, barbershopId, active = true, cpf } = request.body as any;
    const sanitizedBarbershopId = (barbershopId === "NULL" || !barbershopId) ? null : barbershopId;

    const userExists = await prisma.user.findUnique({ where: { email } });
    if (userExists) throw new AppError("E-mail já está em uso", 400);

    let normalizedCpf: string | null = null;
    if (cpf) {
      if (!isValidCpf(cpf)) throw new AppError("CPF inválido (dígitos verificadores incorretos)", 400);
      normalizedCpf = normalizeCpf(cpf);
      const cpfInUse = await prisma.user.findFirst({ where: { cpf: normalizedCpf } });
      if (cpfInUse) throw new AppError("CPF já cadastrado", 400);
    }

    const passwordHash = await hash(password || '123456', 8);

    const user = await prisma.user.create({
      data: { name, email, password: passwordHash, role, barbershopId: sanitizedBarbershopId, active, cpf: normalizedCpf },
      select: { id: true, name: true, email: true, role: true, active: true, barbershopId: true, cpf: true }
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE_USER',
          resource: 'User',
          resourceId: user.id,
          details: JSON.stringify({ name, email, role, barbershopId, hasCpf: !!cpf }),
          ipAddress: request.ip,
        },
      });
    }

    return reply.status(201).send({ success: true, data: user });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { name, email, role, active, barbershopId, cpf } = request.body as any;
    const sanitizedBarbershopId = (barbershopId === "NULL" || !barbershopId) ? null : barbershopId;

    let normalizedCpf: string | null | undefined = undefined;
    if (cpf !== undefined) {
      if (cpf === null || cpf === "") {
        normalizedCpf = null;
      } else {
        if (!isValidCpf(cpf)) throw new AppError("CPF inválido (dígitos verificadores incorretos)", 400);
        normalizedCpf = normalizeCpf(cpf);
        const cpfInUse = await prisma.user.findFirst({ where: { cpf: normalizedCpf, id: { not: id } } });
        if (cpfInUse) throw new AppError("CPF já cadastrado por outro usuário", 400);
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(active !== undefined && { active }),
        ...(barbershopId !== undefined && { barbershopId: sanitizedBarbershopId }),
        ...(normalizedCpf !== undefined && { cpf: normalizedCpf })
      },
      select: { id: true, name: true, email: true, role: true, active: true, cpf: true }
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE_USER',
          resource: 'User',
          resourceId: id,
          details: JSON.stringify({ name, email, role, active, hasCpf: !!cpf }),
          ipAddress: request.ip,
        },
      });
    }

    return reply.status(200).send({ success: true, data: user });
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    await prisma.user.delete({ where: { id } });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'DELETE_USER',
          resource: 'User',
          resourceId: id,
          ipAddress: request.ip,
        },
      });
    }

    return reply.status(200).send({ success: true, message: "Usuário deletado com sucesso" });
  }
}