import { CopilotRepository } from "./copilotRepository";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import type { z } from "zod";
import type { listSuggestionsSchema } from "./copilotSchema";

type ListQuery = z.infer<typeof listSuggestionsSchema>;

export class CopilotUseCases {
  private repo = new CopilotRepository();

  async listSuggestions(barbershopId: string, query: ListQuery) {
    return this.repo.listByBarbershop(barbershopId, {
      type: query.type,
      unreadOnly: query.unreadOnly,
    });
  }

  async markRead(id: string, barbershopId: string) {
    const suggestion = await this.repo.findById(id);
    if (!suggestion) throw new AppError("Sugestão não encontrada", 404);
    if (suggestion.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.markRead(id);
  }

  async dismiss(id: string, barbershopId: string) {
    const suggestion = await this.repo.findById(id);
    if (!suggestion) throw new AppError("Sugestão não encontrada", 404);
    if (suggestion.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.dismiss(id);
  }

  async accept(id: string, barbershopId: string) {
    const suggestion = await this.repo.findById(id);
    if (!suggestion) throw new AppError("Sugestão não encontrada", 404);
    if (suggestion.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.accept(id);
  }

  async generateSuggestions(barbershopId: string) {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { id: true, name: true },
    });
    if (!barbershop) throw new AppError("Barbearia não encontrada", 404);

    const suggestions: Awaited<ReturnType<CopilotRepository["create"]>>[] = [];

    // Schedule gap analysis
    const scheduleGap = await this.analyzeScheduleGaps(barbershopId);
    if (scheduleGap) suggestions.push(scheduleGap);

    // Client win-back
    const winBack = await this.analyzeClientWinBack(barbershopId);
    if (winBack) suggestions.push(winBack);

    // Pricing optimization
    const pricing = await this.analyzePricingOptimization(barbershopId);
    if (pricing) suggestions.push(pricing);

    // Inventory alerts
    const inventory = await this.analyzeInventoryAlerts(barbershopId);
    if (inventory) suggestions.push(inventory);

    // Campaign ideas
    const campaign = await this.analyzeCampaignIdeas(barbershopId);
    if (campaign) suggestions.push(campaign);

    // Revenue tips
    const revenue = await this.analyzeRevenueTips(barbershopId);
    if (revenue) suggestions.push(revenue);

    // Retention risks
    const retention = await this.analyzeRetentionRisks(barbershopId);
    if (retention) suggestions.push(retention);

    // Staff performance
    const staff = await this.analyzeStaffPerformance(barbershopId);
    if (staff) suggestions.push(staff);

    return { generated: suggestions.length, suggestions };
  }

  private async analyzeScheduleGaps(barbershopId: string) {
    if (await this.repo.findRecentByType(barbershopId, "schedule_gap")) return null;

    const now = new Date();
    const dayOfWeek = now.getDay();

    const schedules = await prisma.schedule.findMany({
      where: { barbershopId, isOpen: true },
    });

    const todaySchedule = schedules.find((s: { dayOfWeek: number }) => s.dayOfWeek === dayOfWeek);
    if (!todaySchedule) return null;

    const appointments = await prisma.appointment.count({
      where: {
        barbershopId,
        date: now.toISOString().split("T")[0],
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
      },
    });

    const staffCount = await prisma.user.count({
      where: { barbershopId, role: "EMPLOYEE", active: true },
    });

    const capacity = staffCount * 8;
    const utilization = capacity > 0 ? (appointments / capacity) * 100 : 0;

    if (utilization < 50) {
      return this.repo.create({
        barbershopId,
        type: "schedule_gap",
        title: "Horários com baixa demanda",
        description: `A ocupação hoje está em ${Math.round(utilization)}%. Considere enviar promoções ou ajustar a equipe.`,
        priority: 2,
        metadata: { utilization, appointments, staffCount },
      });
    }
    return null;
  }

  private async analyzeClientWinBack(barbershopId: string) {
    if (await this.repo.findRecentByType(barbershopId, "client_win_back")) return null;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const inactiveClients = await prisma.salonClient.findMany({
      where: {
        barbershopId,
        totalAppointments: { gte: 3 },
        updatedAt: { lte: thirtyDaysAgo },
      },
      select: { id: true, name: true, whatsapp: true, totalAppointments: true },
      take: 10,
    });

    if (inactiveClients.length > 0) {
      return this.repo.create({
        barbershopId,
        type: "client_win_back",
        title: `${inactiveClients.length} clientes fiéis sem visitas`,
        description: `${inactiveClients.length} clientes com 3+ agendamentos não retornaram nos últimos 30 dias. Considere campanhas de reativação.`,
        priority: 3,
        metadata: {
          count: inactiveClients.length,
          clients: inactiveClients.map((c: { id: string; name: string; totalAppointments: number }) => ({
            id: c.id,
            name: c.name,
            lastVisit: c.totalAppointments,
          })),
        },
      });
    }
    return null;
  }

  private async analyzePricingOptimization(barbershopId: string) {
    if (await this.repo.findRecentByType(barbershopId, "pricing_optimization")) return null;

    const services = await prisma.service.findMany({
      where: { barbershopId, active: true },
      select: { id: true, name: true, price: true, avgTimeMinutes: true },
    });

    const lowPricedServices = services.filter((s: { price: number; avgTimeMinutes: number }) => {
      const hourlyRate = (s.price / s.avgTimeMinutes) * 60;
      return hourlyRate < 50;
    });

    if (lowPricedServices.length > 0) {
      return this.repo.create({
        barbershopId,
        type: "pricing_optimization",
        title: "Serviços com preço abaixo do mercado",
        description: `${lowPricedServices.length} serviços podem estar subvalorizados. Considere ajustar preços.`,
        priority: 1,
        metadata: {
          services: lowPricedServices.map((s: { id: string; name: string; price: number; avgTimeMinutes: number }) => ({
            id: s.id,
            name: s.name,
            price: s.price,
            avgTimeMinutes: s.avgTimeMinutes,
            hourlyRate: Math.round((s.price / s.avgTimeMinutes) * 60),
          })),
        },
      });
    }
    return null;
  }

  private async analyzeInventoryAlerts(barbershopId: string) {
    if (await this.repo.findRecentByType(barbershopId, "inventory_alert")) return null;

    const products = await prisma.product.findMany({
      where: { barbershopId, active: true },
      select: { id: true, name: true, stockQuantity: true },
    });

    const lowStock = products.filter((p: { stockQuantity: number }) => p.stockQuantity <= 5);

    if (lowStock.length > 0) {
      return this.repo.create({
        barbershopId,
        type: "inventory_alert",
        title: `${lowStock.length} produtos com estoque baixo`,
        description: "Alguns produtos estão com estoque baixo e precisam de reposição.",
        priority: 2,
        metadata: {
          products: lowStock.map((p: { id: string; name: string; stockQuantity: number }) => ({
            id: p.id,
            name: p.name,
            stock: p.stockQuantity,
          })),
        },
      });
    }
    return null;
  }

  private async analyzeCampaignIdeas(barbershopId: string) {
    if (await this.repo.findRecentByType(barbershopId, "campaign_idea")) return null;

    const totalClients = await prisma.salonClient.count({
      where: { barbershopId },
    });

    const withOptIn = await prisma.salonClient.count({
      where: { barbershopId, marketingOptIn: true },
    });

    if (totalClients > 0 && withOptIn > totalClients * 0.3) {
      return this.repo.create({
        barbershopId,
        type: "campaign_idea",
        title: "Campanha disponível",
        description: `${withOptIn} de ${totalClients} clientes aceitaram receber promoções. Crie uma campanha de marketing.`,
        priority: 1,
        metadata: { totalClients, withOptIn, optInRate: Math.round((withOptIn / totalClients) * 100) },
      });
    }
    return null;
  }

  private async analyzeRevenueTips(barbershopId: string) {
    if (await this.repo.findRecentByType(barbershopId, "revenue_tip")) return null;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const completedAppointments = await prisma.appointment.findMany({
      where: {
        barbershopId,
        status: "COMPLETED",
        updatedAt: { gte: thirtyDaysAgo },
      },
      include: { service: { select: { price: true } } },
    });

    if (completedAppointments.length === 0) return null;

    const serviceCounts = completedAppointments.reduce(
      (acc: Record<string, number>, a: { serviceId: string }) => {
        acc[a.serviceId] = (acc[a.serviceId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const entries = Object.keys(serviceCounts).map(
      (key) => [key, serviceCounts[key]] as [string, number]
    );
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const topServiceId = sorted[0]?.[0];

    if (topServiceId && sorted[0][1] > completedAppointments.length * 0.5) {
      const topService = await prisma.service.findUnique({
        where: { id: topServiceId },
        select: { name: true, price: true },
      });

      if (topService) {
        return this.repo.create({
          barbershopId,
          type: "revenue_tip",
          title: "Serviço mais popular",
          description: `"${topService.name}" representa mais de 50% dos atendimentos. Considere criar pacotes ou combos.`,
          priority: 1,
          metadata: {
            serviceName: topService.name,
            count: sorted[0][1],
            totalAppointments: completedAppointments.length,
          },
        });
      }
    }
    return null;
  }

  private async analyzeRetentionRisks(barbershopId: string) {
    if (await this.repo.findRecentByType(barbershopId, "retention_risk")) return null;

    const atRiskClients = await prisma.salonClient.findMany({
      where: {
        barbershopId,
        totalCancellations: { gte: 3 },
        totalNoShows: { gte: 2 },
      },
      select: { id: true, name: true, totalCancellations: true, totalNoShows: true },
      take: 10,
    });

    if (atRiskClients.length > 0) {
      return this.repo.create({
        barbershopId,
        type: "retention_risk",
        title: `${atRiskClients.length} clientes com risco de evasão`,
        description: "Clientes com histórico de cancelamentos e no-shows. Considere políticas de retenção.",
        priority: 3,
        metadata: {
          clients: atRiskClients.map((c: { id: string; name: string; totalCancellations: number; totalNoShows: number }) => ({
            id: c.id,
            name: c.name,
            cancellations: c.totalCancellations,
            noShows: c.totalNoShows,
          })),
        },
      });
    }
    return null;
  }

  private async analyzeStaffPerformance(barbershopId: string) {
    if (await this.repo.findRecentByType(barbershopId, "staff_performance")) return null;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const staff = await prisma.user.findMany({
      where: { barbershopId, role: "EMPLOYEE", active: true },
      select: { id: true, name: true },
    });

    if (staff.length === 0) return null;

    const staffCompletions = await Promise.all(
      staff.map(async (s: { id: string; name: string }) => {
        const count = await prisma.appointment.count({
          where: {
            barbershopId,
            staffId: s.id,
            status: "COMPLETED",
            updatedAt: { gte: thirtyDaysAgo },
          },
        });
        return { id: s.id, name: s.name, count };
      })
    );

    const sorted = staffCompletions.sort((a, b) => b.count - a.count);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];

    if (top && bottom && top.count > bottom.count * 2) {
      return this.repo.create({
        barbershopId,
        type: "staff_performance",
        title: "Diferença de performance entre equipe",
        description: `${top.name} completou ${top.count} atendimentos vs ${bottom.name} com ${bottom.count}. Considere treinamento.`,
        priority: 1,
        metadata: { staff: sorted },
      });
    }
    return null;
  }
}
