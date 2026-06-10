import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";

type Period = 'day' | 'week' | '1m' | '3m' | '6m' | '12m' | '1y' | '2y' | '3y' | '5y';

function getPeriodConfig(period: Period) {
  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case 'day':
      start.setDate(now.getDate() - 1);
      return { startDate: start, groupByFormat: 'day' as const, label: 'Últimas 24h' };
    case 'week':
      start.setDate(now.getDate() - 7);
      return { startDate: start, groupByFormat: 'day' as const, label: 'Últimos 7 dias' };
    case '1m':
      start.setMonth(now.getMonth() - 1);
      return { startDate: start, groupByFormat: 'day' as const, label: 'Último mês' };
    case '3m':
      start.setMonth(now.getMonth() - 3);
      return { startDate: start, groupByFormat: 'week' as const, label: 'Últimos 3 meses' };
    case '6m':
      start.setMonth(now.getMonth() - 6);
      return { startDate: start, groupByFormat: 'month' as const, label: 'Último semestre' };
    case '12m':
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, groupByFormat: 'month' as const, label: 'Últimos 12 meses' };
    case '1y':
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, groupByFormat: 'month' as const, label: '1 ano' };
    case '2y':
      start.setFullYear(now.getFullYear() - 2);
      return { startDate: start, groupByFormat: 'month' as const, label: '2 anos' };
    case '3y':
      start.setFullYear(now.getFullYear() - 3);
      return { startDate: start, groupByFormat: 'month' as const, label: '3 anos' };
    case '5y':
      start.setFullYear(now.getFullYear() - 5);
      return { startDate: start, groupByFormat: 'year' as const, label: '5 anos' };
    default:
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, groupByFormat: 'month' as const, label: 'Últimos 12 meses' };
  }
}

function formatLabel(date: Date, format: 'day' | 'week' | 'month' | 'year'): string {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  if (format === 'day') return `${date.getDate()}/${months[date.getMonth()]}`;
  if (format === 'week') return `S${Math.ceil(date.getDate() / 7)} ${months[date.getMonth()]}`;
  if (format === 'month') return months[date.getMonth()] + '/' + String(date.getFullYear()).slice(2);
  return String(date.getFullYear());
}

function generateTimeSlots(startDate: Date, format: 'day' | 'week' | 'month' | 'year') {
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

export class AdminDashboardController {
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

    const chartData = await Promise.all(
      slots.map(async ({ label: slotLabel, date: slotStart }) => {
        const slotEnd = new Date(slotStart);
        if (groupByFormat === 'day') slotEnd.setDate(slotStart.getDate() + 1);
        else if (groupByFormat === 'week') slotEnd.setDate(slotStart.getDate() + 7);
        else if (groupByFormat === 'month') slotEnd.setMonth(slotStart.getMonth() + 1);
        else slotEnd.setFullYear(slotStart.getFullYear() + 1);

        const [newShops, appointments, completedQueue] = await Promise.all([
          prisma.barbershop.count({ where: { createdAt: { gte: slotStart, lt: slotEnd } } }),
          prisma.appointment.count({ where: { createdAt: { gte: slotStart, lt: slotEnd } } }),
          prisma.queueItem.count({ where: { joinedAt: { gte: slotStart, lt: slotEnd }, status: 'COMPLETED' } }),
        ]);

        return { label: slotLabel, newShops, appointments, completedQueue };
      })
    );

    const recentBarbershops = await prisma.barbershop.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, whatsapp: true, active: true,
        approvalStatus: true, createdAt: true, address: true,
        _count: { select: { users: true } },
      },
    });

    return reply.status(200).send({
      success: true,
      data: {
        periodLabel: label,
        kpis: { totalBarbershops, activeBarbershops, totalUsers, newInPeriod, growthRate: `${Number(growthRate) > 0 ? '+' : ''}${growthRate}%` },
        chartData,
        recentBarbershops,
      },
    });
  }
}