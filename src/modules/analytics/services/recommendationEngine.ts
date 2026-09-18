import { prisma } from '@/libs/prismaClient';

export interface Recommendation {
  id: string;
  type: 'LOW_OCCASION_TOMORROW' | 'CLIENT_OVERDUE' | 'PRODUCT_REORDER' | 'PROFESSIONAL_UNDERPERFORMING';
  title: string;
  reason: string;
  impact: string;
  suggestedAction: string;
  priority: 'high' | 'medium' | 'low';
  metadata: Record<string, unknown>;
}

export class RecommendationEngine {
  private barbershopId: string;
  private recommendations: Recommendation[] = [];

  constructor(barbershopId: string) {
    this.barbershopId = barbershopId;
  }

  async generate(): Promise<Recommendation[]> {
    this.recommendations = [];

    await Promise.all([
      this.checkLowOccupationTomorrow(),
      this.checkClientOverdue(),
      this.checkProductReorder(),
      this.checkProfessionalUnderperforming(),
    ]);

    const dismissed = await prisma.dismissedRecommendation.findMany({
      where: { barbershopId: this.barbershopId },
      select: { recommendationId: true },
    });
    const dismissedIds = new Set(dismissed.map((row: { recommendationId: string }) => row.recommendationId));
    this.recommendations = this.recommendations.filter((item) => !dismissedIds.has(item.id));

    return this.recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private async checkLowOccupationTomorrow(): Promise<void> {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfterTomorrow = new Date(tomorrow);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

      const [appointments, schedules] = await Promise.all([
        prisma.appointment.findMany({
          where: {
            barbershopId: this.barbershopId,
            date: { gte: tomorrow, lt: dayAfterTomorrow },
            status: { in: ['CONFIRMED', 'CHECKED_IN'] },
          },
          select: { id: true },
        }),
        prisma.schedule.findMany({
          where: {
            barbershopId: this.barbershopId,
            dayOfWeek: tomorrow.getDay(),
            isOpen: true,
          },
          select: { openTime: true, closeTime: true },
        }),
      ]);

      if (schedules.length === 0) return;

      const totalSlots = schedules.length * 8;
      const bookedSlots = appointments.length;
      const occupationRate = totalSlots > 0 ? bookedSlots / totalSlots : 0;

      if (occupationRate < 0.5) {
        const dateStr = tomorrow.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
        this.recommendations.push({
          id: `low-occ-${tomorrow.toISOString().slice(0, 10)}`,
          type: 'LOW_OCCASION_TOMORROW',
          title: `Baixa ocupação amanhã (${dateStr})`,
          reason: `Apenas ${Math.round(occupationRate * 100)}% dos horários estão preenchidos`,
          impact: 'Receita potencialmente reduzida',
          suggestedAction: 'Considere enviar lembretes por WhatsApp ou criar uma promoção relâmpago',
          priority: occupationRate < 0.3 ? 'high' : 'medium',
          metadata: {
            date: tomorrow.toISOString().slice(0, 10),
            occupationRate,
            bookedSlots,
            totalSlots,
          },
        });
      }
    } catch (error) {
      console.error('Error checking low occupation:', error);
    }
  }

  private async checkClientOverdue(): Promise<void> {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const clients = await prisma.salonClient.findMany({
        where: {
          barbershopId: this.barbershopId,
          appointments: {
            some: {
              status: { in: ['CONFIRMED', 'COMPLETED', 'CHECKED_IN'] },
              date: { gte: ninetyDaysAgo },
            },
          },
        },
        select: {
          id: true,
          name: true,
          whatsapp: true,
          appointments: {
            where: {
              status: { in: ['CONFIRMED', 'COMPLETED', 'CHECKED_IN'] },
              date: { gte: ninetyDaysAgo },
            },
            select: { date: true },
            orderBy: { date: 'desc' },
          },
        },
      });

      const overdueClients: Array<{
        id: string;
        name: string;
        whatsapp: string;
        lastVisit: Date;
        avgInterval: number;
        daysSinceLastVisit: number;
      }> = [];

      for (const client of clients) {
        if (client.appointments.length < 2) continue;

        const dates = client.appointments.map((a: typeof client.appointments[number]) => new Date(a.date).getTime());
        const intervals = [];
        for (let i = 1; i < dates.length; i++) {
          intervals.push(dates[i] - dates[i - 1]);
        }

        const avgInterval = intervals.reduce((s, i) => s + i, 0) / intervals.length;
        const lastVisit = new Date(dates[0]);
        const daysSinceLastVisit = (Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceLastVisit > (avgInterval / (1000 * 60 * 60 * 24)) * 2) {
          overdueClients.push({
            id: client.id,
            name: client.name,
            whatsapp: client.whatsapp,
            lastVisit,
            avgInterval: avgInterval / (1000 * 60 * 60 * 24),
            daysSinceLastVisit,
          });
        }
      }

      if (overdueClients.length > 0) {
        const topOverdue = overdueClients
          .sort((a, b) => b.daysSinceLastVisit / b.avgInterval - a.daysSinceLastVisit / a.avgInterval)
          .slice(0, 5);

        this.recommendations.push({
          id: 'client-overdue',
          type: 'CLIENT_OVERDUE',
          title: `${overdueClients.length} cliente(s) atrasado(s)`,
          reason: 'Clientes que não visitam há mais do que o dobro do intervalo médio',
          impact: 'Risco de perda de clientes fiéis',
          suggestedAction: 'Envie uma mensagem de recall personalizada via WhatsApp',
          priority: overdueClients.length > 10 ? 'high' : 'medium',
          metadata: {
            count: overdueClients.length,
            clients: topOverdue.map(c => ({
              id: c.id,
              name: c.name,
              daysSinceLastVisit: Math.round(c.daysSinceLastVisit),
              avgInterval: Math.round(c.avgInterval),
            })),
          },
        });
      }
    } catch (error) {
      console.error('Error checking client overdue:', error);
    }
  }

  private async checkProductReorder(): Promise<void> {
    try {
      const lowStockProducts = await prisma.product.findMany({
        where: {
          barbershopId: this.barbershopId,
          active: true,
          trackStock: true,
          stockQty: { lte: prisma.product.fields.minStock },
        },
        select: {
          id: true,
          name: true,
          stockQty: true,
          minStock: true,
          sku: true,
        },
      });

      if (lowStockProducts.length > 0) {
        this.recommendations.push({
          id: 'product-reorder',
          type: 'PRODUCT_REORDER',
          title: `${lowStockProducts.length} produto(s) com estoque baixo`,
          reason: 'Produtos abaixo do estoque mínimo configurado',
          impact: 'Possível falta de estoque para vendas',
          suggestedAction: 'Verifique o estoque e faça pedido de reposição',
          priority: lowStockProducts.some((p: typeof lowStockProducts[number]) => p.stockQty <= 0) ? 'high' : 'medium',
          metadata: {
            count: lowStockProducts.length,
            products: lowStockProducts.map((p: typeof lowStockProducts[number]) => ({
              id: p.id,
              name: p.name,
              stockQty: p.stockQty,
              minStock: p.minStock,
              sku: p.sku,
            })),
          },
        });
      }
    } catch (error) {
      console.error('Error checking product reorder:', error);
    }
  }

  private async checkProfessionalUnderperforming(): Promise<void> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const goals = await prisma.professionalGoal.findMany({
        where: {
          barbershopId: this.barbershopId,
          period: 'MONTHLY',
          startDate: { lte: endOfMonth },
          endDate: { gte: startOfMonth },
        },
        select: {
          id: true,
          professionalId: true,
          metric: true,
          target: true,
          professional: {
            select: { name: true },
          },
        },
      });

      const underperforming: Array<{
        professionalId: string;
        name: string;
        metric: string;
        target: number;
        current: number;
        percentage: number;
      }> = [];

      for (const goal of goals) {
        let current = 0;

        if (goal.metric === 'REVENUE') {
          const result = await prisma.appointment.aggregate({
            where: {
              barbershopId: this.barbershopId,
              staffId: goal.professionalId,
              date: { gte: startOfMonth, lte: endOfMonth },
              status: { in: ['COMPLETED', 'CHECKED_IN'] },
            },
            _sum: { service: { select: { price: true } } },
          });
          current = (result._sum as any)?.service?.price ?? 0;
        } else if (goal.metric === 'APPOINTMENTS') {
          current = await prisma.appointment.count({
            where: {
              barbershopId: this.barbershopId,
              staffId: goal.professionalId,
              date: { gte: startOfMonth, lte: endOfMonth },
              status: { in: ['COMPLETED', 'CHECKED_IN'] },
            },
          });
        }

        const target = Number(goal.target);
        if (target > 0) {
          const percentage = (current / target) * 100;
          if (percentage < 60) {
            underperforming.push({
              professionalId: goal.professionalId,
              name: goal.professional.name,
              metric: goal.metric,
              target,
              current,
              percentage,
            });
          }
        }
      }

      if (underperforming.length > 0) {
        this.recommendations.push({
          id: 'professional-underperforming',
          type: 'PROFESSIONAL_UNDERPERFORMING',
          title: `${underperforming.length} profissional(is) abaixo da meta`,
          reason: 'Profissionais com menos de 60% da meta mensal',
          impact: 'Meta mensal pode não ser atingida',
          suggestedAction: 'Verifique a agenda e considere ajustes ou incentivos',
          priority: underperforming.some(p => p.percentage < 40) ? 'high' : 'medium',
          metadata: {
            count: underperforming.length,
            professionals: underperforming.map((p: typeof underperforming[number]) => ({
              id: p.professionalId,
              name: p.name,
              metric: p.metric,
              target: p.target,
              current: p.current,
              percentage: Math.round(p.percentage),
            })),
          },
        });
      }
    } catch (error) {
      console.error('Error checking professional underperforming:', error);
    }
  }

  async dismiss(recommendationId: string): Promise<boolean> {
    if (!recommendationId?.trim()) return false;
    await prisma.dismissedRecommendation.upsert({
      where: {
        barbershopId_recommendationId: {
          barbershopId: this.barbershopId,
          recommendationId,
        },
      },
      create: { barbershopId: this.barbershopId, recommendationId },
      update: {},
    });
    this.recommendations = this.recommendations.filter((item) => item.id !== recommendationId);
    return true;
  }
}