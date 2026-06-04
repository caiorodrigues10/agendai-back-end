import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { hash } from "bcryptjs";

// ---------------------
// Helpers de Período
// ---------------------

type Period = 'day' | 'week' | '1m' | '3m' | '6m' | '12m' | '1y' | '2y' | '3y' | '5y';

function getPeriodConfig(period: Period): { startDate: Date; groupByFormat: 'day' | 'week' | 'month' | 'year'; label: string } {
  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case 'day':
      start.setDate(now.getDate() - 1);
      return { startDate: start, groupByFormat: 'day', label: 'Últimas 24h' };
    case 'week':
      start.setDate(now.getDate() - 7);
      return { startDate: start, groupByFormat: 'day', label: 'Últimos 7 dias' };
    case '1m':
      start.setMonth(now.getMonth() - 1);
      return { startDate: start, groupByFormat: 'day', label: 'Último mês' };
    case '3m':
      start.setMonth(now.getMonth() - 3);
      return { startDate: start, groupByFormat: 'week', label: 'Últimos 3 meses' };
    case '6m':
      start.setMonth(now.getMonth() - 6);
      return { startDate: start, groupByFormat: 'month', label: 'Último semestre' };
    case '12m':
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, groupByFormat: 'month', label: 'Últimos 12 meses' };
    case '1y':
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, groupByFormat: 'month', label: '1 ano' };
    case '2y':
      start.setFullYear(now.getFullYear() - 2);
      return { startDate: start, groupByFormat: 'month', label: '2 anos' };
    case '3y':
      start.setFullYear(now.getFullYear() - 3);
      return { startDate: start, groupByFormat: 'month', label: '3 anos' };
    case '5y':
      start.setFullYear(now.getFullYear() - 5);
      return { startDate: start, groupByFormat: 'year', label: '5 anos' };
    default:
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, groupByFormat: 'month', label: 'Últimos 12 meses' };
  }
}

function formatLabel(date: Date, format: 'day' | 'week' | 'month' | 'year'): string {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  if (format === 'day') return `${date.getDate()}/${months[date.getMonth()]}`;
  if (format === 'week') return `S${Math.ceil(date.getDate() / 7)} ${months[date.getMonth()]}`;
  if (format === 'month') return months[date.getMonth()] + '/' + String(date.getFullYear()).slice(2);
  return String(date.getFullYear());
}

function generateTimeSlots(startDate: Date, format: 'day' | 'week' | 'month' | 'year'): Array<{ label: string; date: Date }> {
  const now = new Date();
  const slots: Array<{ label: string; date: Date }> = [];
  const current = new Date(startDate);

  while (current <= now) {
    slots.push({ label: formatLabel(new Date(current), format), date: new Date(current) });
    if (format === 'day') current.setDate(current.getDate() + 1);
    else if (format === 'week') current.setDate(current.getDate() + 7);
    else if (format === 'month') current.setMonth(current.getMonth() + 1);
    else current.setFullYear(current.getFullYear() + 1);
  }

  return slots;
}

export class AdminController {
  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const { period = '12m' } = request.query as { period?: Period };
    const { startDate, groupByFormat, label } = getPeriodConfig(period as Period);

    const [totalBarbershops, activeBarbershops, totalUsers] = await Promise.all([
      prisma.barbershop.count(),
      prisma.barbershop.count({ where: { active: true } }),
      prisma.user.count({ where: { role: { in: ['OWNER', 'EMPLOYEE'] } } }),
    ]);

    const prevStart = new Date(startDate);
    const diffMs = Date.now() - startDate.getTime();
    prevStart.setTime(startDate.getTime() - diffMs);

    const [newInPeriod, newInPrevPeriod] = await Promise.all([
      prisma.barbershop.count({ where: { createdAt: { gte: startDate } } }),
      prisma.barbershop.count({ where: { createdAt: { gte: prevStart, lt: startDate } } }),
    ]);

    const growthRate = newInPrevPeriod > 0
      ? (((newInPeriod - newInPrevPeriod) / newInPrevPeriod) * 100).toFixed(1)
      : newInPeriod > 0 ? '+100' : '0';

    const slots = generateTimeSlots(startDate, groupByFormat);

    // Queries agregadas por slot — evita carregar todos os registros em memória
    const chartData = await Promise.all(
      slots.map(async ({ label: slotLabel, date: slotStart }) => {
        const slotEnd = new Date(slotStart);
        if (groupByFormat === 'day') slotEnd.setDate(slotStart.getDate() + 1);
        else if (groupByFormat === 'week') slotEnd.setDate(slotStart.getDate() + 7);
        else if (groupByFormat === 'month') slotEnd.setMonth(slotStart.getMonth() + 1);
        else slotEnd.setFullYear(slotStart.getFullYear() + 1);

        const [newShops, appointments, completedQueue] = await Promise.all([
          prisma.barbershop.count({
            where: { createdAt: { gte: slotStart, lt: slotEnd } }
          }),
          prisma.appointment.count({
            where: { createdAt: { gte: slotStart, lt: slotEnd } }
          }),
          prisma.queueItem.count({
            where: { joinedAt: { gte: slotStart, lt: slotEnd }, status: 'COMPLETED' }
          }),
        ]);

        return { label: slotLabel, newShops, appointments, completedQueue };
      })
    );

    const recentBarbershops = await prisma.barbershop.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        active: true,
        approvalStatus: true,
        createdAt: true,
        address: true,
        _count: { select: { users: true } },
      },
    });

    return reply.status(200).send({
      success: true,
      data: {
        periodLabel: label,
        kpis: {
          totalBarbershops,
          activeBarbershops,
          totalUsers,
          newInPeriod,
          growthRate: `${Number(growthRate) > 0 ? '+' : ''}${growthRate}%`,
        },
        chartData,
        recentBarbershops,
      },
    });
  }

  async listBarbershops(request: FastifyRequest, reply: FastifyReply) {
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
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          cnpj: true,
          whatsapp: true,
          address: true,
          active: true,
          approvalStatus: true,
          createdAt: true,
          _count: { select: { users: true, appointments: true, queue: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.barbershop.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: barbershops,
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  }

  async updateBarbershopStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { active, approvalStatus, rejectionReason } = request.body as any;

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

  async createBarbershop(request: FastifyRequest, reply: FastifyReply) {
    const { name, whatsapp, cnpj, address, active = true } = request.body as any;

    const barbershop = await prisma.barbershop.create({
      data: {
        name,
        whatsapp,
        cnpj,
        address,
        active,
        approvalStatus: 'APPROVED', // Master Admin creation is auto-approved
      },
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

  async listUsers(request: FastifyRequest, reply: FastifyReply) {
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
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          barbershopId: true,
          createdAt: true,
          barbershop: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: users,
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  }

  async createUser(request: FastifyRequest, reply: FastifyReply) {
    const { name, email, password, role, barbershopId, active = true } = request.body as any;

    const sanitizedBarbershopId = (barbershopId === "NULL" || !barbershopId) ? null : barbershopId;

    // Check if email already exists
    const userExists = await prisma.user.findUnique({ where: { email } });
    if (userExists) {
      throw new AppError("E-mail já está em uso", 400);
    }

    // Hash password
    const passwordHash = await hash(password || '123456', 8);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        role,
        barbershopId: sanitizedBarbershopId,
        active,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        barbershopId: true,
      }
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'CREATE_USER',
          resource: 'User',
          resourceId: user.id,
          details: JSON.stringify({ name, email, role, barbershopId }),
          ipAddress: request.ip,
        },
      });
    }

    return reply.status(201).send({ success: true, data: user });
  }

  async updateUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { name, email, role, active, barbershopId } = request.body as any;

    const sanitizedBarbershopId = (barbershopId === "NULL" || !barbershopId) ? null : barbershopId;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(active !== undefined && { active }),
        ...(barbershopId !== undefined && { barbershopId: sanitizedBarbershopId }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      }
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'UPDATE_USER',
          resource: 'User',
          resourceId: id,
          details: JSON.stringify({ name, email, role, active }),
          ipAddress: request.ip,
        },
      });
    }

    return reply.status(200).send({ success: true, data: user });
  }

  async deleteUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    await prisma.user.delete({
      where: { id },
    });

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

  async listAuditLogs(request: FastifyRequest, reply: FastifyReply) {
    const { page = 1, limit = 20, userId, resource, action } = request.query as any;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};
    if (userId) where.userId = userId;
    if (resource) where.resource = resource;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: logs,
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  }
}
