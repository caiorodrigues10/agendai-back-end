import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { ICrmRepository } from "../repositories/ICrmRepository";
import { CrmForecastDTO, CrmSegment } from "../dtos/ICrmDTO";
import { IWeatherProvider } from "@/shared/container/providers/WeatherProvider/IWeatherProvider";
import { backfillCrmLedger } from "../services/crmLedger";

export type CrmUser = { id: string; role: string; barbershopId?: string };
export type CrmPermission = "CRM_ANALYTICS_VIEW" | "CRM_CAMPAIGNS_MANAGE";

export async function assertCrmAccess(user: CrmUser, barbershopId: string, permission: CrmPermission): Promise<void> {
  if (user.role === "MASTER_ADMIN" || user.role === "OWNER") return;
  if (user.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { permissions: true } });
  if (!record?.permissions.includes(permission)) throw new AppError("Você não possui permissão para acessar a inteligência do CRM", 403);
}

@injectable()
export class GetCrmOverviewUseCase {
  constructor(@inject("CrmRepository") private repo: ICrmRepository) {}
  async execute(barbershopId: string, from: Date, to: Date, compare: boolean, user: CrmUser) {
    await assertCrmAccess(user, barbershopId, "CRM_ANALYTICS_VIEW");
    return this.repo.overview(barbershopId, from, to, compare);
  }
}

@injectable()
export class ListCrmClientsUseCase {
  constructor(@inject("CrmRepository") private repo: ICrmRepository) {}
  async execute(barbershopId: string, params: { page: number; limit: number; search?: string; segment?: CrmSegment; sort?: "ltv" | "lastVisit" | "outstanding" }, user: CrmUser) {
    await assertCrmAccess(user, barbershopId, "CRM_ANALYTICS_VIEW");
    return this.repo.listClients(barbershopId, params);
  }
}

@injectable()
export class GetCrmClientUseCase {
  constructor(@inject("CrmRepository") private repo: ICrmRepository) {}
  async execute(barbershopId: string, clientId: string, user: CrmUser) {
    await assertCrmAccess(user, barbershopId, "CRM_ANALYTICS_VIEW");
    const result = await this.repo.getClientProfile(barbershopId, clientId);
    if (!result) throw new AppError("Cliente não encontrado", 404);
    return result;
  }
}

@injectable()
export class MergeCrmClientsUseCase {
  constructor(@inject("CrmRepository") private repo: ICrmRepository) {}
  async execute(barbershopId: string, targetId: string, sourceIds: string[], user: CrmUser): Promise<void> {
    await assertCrmAccess(user, barbershopId, "CRM_ANALYTICS_VIEW");
    await this.repo.mergeClients(barbershopId, targetId, sourceIds);
  }
}

@injectable()
export class BackfillCrmUseCase {
  async execute(barbershopId: string, user: CrmUser) {
    if (user.role !== "MASTER_ADMIN" && user.role !== "OWNER") throw new AppError("Apenas o proprietário pode executar o backfill", 403);
    if (user.role !== "MASTER_ADMIN" && user.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);
    return backfillCrmLedger(barbershopId);
  }
}

@injectable()
export class GetCrmForecastUseCase {
  constructor(@inject("WeatherProvider") private weather: IWeatherProvider) {}
  async execute(barbershopId: string, horizon: number, user: CrmUser): Promise<CrmForecastDTO> {
    await assertCrmAccess(user, barbershopId, "CRM_ANALYTICS_VIEW");
    const [shop, logs, events, appointments] = await Promise.all([
      prisma.barbershop.findUnique({ where: { id: barbershopId }, select: { latitude: true, longitude: true } }),
      prisma.dailyWeatherLog.findMany({ where: { barbershopId, date: { gte: new Date(Date.now() - 365 * 86_400_000) } }, orderBy: { date: "asc" } }),
      prisma.crmFinancialEvent.findMany({ where: { barbershopId, occurredAt: { gte: new Date(Date.now() - 365 * 86_400_000) } } }),
      prisma.appointment.findMany({ where: { barbershopId, status: { in: ["CONFIRMED", "CHECKED_IN"] }, date: { gte: new Date() } }, select: { date: true, service: { select: { price: true } } } }),
    ]);
    const historicalDays = logs.length;
    const maturity = historicalDays < 30 ? "insufficient" : historicalDays < 90 ? "preliminary" : "trained";
    const revenueByDay = new Map<string, number>();
    const visitByDay = new Map<string, number>();
    for (const event of events) { const key = event.occurredAt.toISOString().slice(0, 10); revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + event.grossAmount); if (event.kind === "SERVICE_COMPLETED") visitByDay.set(key, (visitByDay.get(key) ?? 0) + 1); }
    const weekdayRevenue = Array.from({ length: 7 }, () => [] as number[]);
    const weekdayVisits = Array.from({ length: 7 }, () => [] as number[]);
    revenueByDay.forEach((revenue, key) => weekdayRevenue[new Date(`${key}T12:00:00`).getDay()].push(revenue));
    visitByDay.forEach((visits, key) => weekdayVisits[new Date(`${key}T12:00:00`).getDay()].push(visits));
    const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const allRevenue = [...revenueByDay.values()]; const mean = avg(allRevenue); const std = Math.sqrt(avg(allRevenue.map((value) => (value - mean) ** 2)));
    let forecast: Awaited<ReturnType<IWeatherProvider["getForecast"]>> = [];
    if (shop?.latitude != null && shop.longitude != null) {
      try { forecast = await this.weather.getForecast(shop.latitude, shop.longitude, Math.min(horizon, 16)); } catch { forecast = []; }
    }
    const bookedByDay = new Map<string, number>();
    appointments.forEach((appointment: any) => { const key = appointment.date.toISOString().slice(0, 10); bookedByDay.set(key, (bookedByDay.get(key) ?? 0) + appointment.service.price); });
    const start = new Date(); start.setHours(12, 0, 0, 0);
    const predictions = Array.from({ length: horizon }, (_, index) => {
      const date = new Date(start); date.setDate(date.getDate() + index + 1); const key = date.toISOString().slice(0, 10); const weather = forecast.find((entry) => entry.date === key);
      const rainMultiplier = weather && weather.precipProbability >= 70 ? 0.8 : weather && weather.precipProbability >= 45 ? 0.9 : 1;
      const baseRevenue = avg(weekdayRevenue[date.getDay()]) || mean;
      const baseVisits = avg(weekdayVisits[date.getDay()]);
      const booked = bookedByDay.get(key) ?? 0;
      const predictedRevenue = Math.max(booked, baseRevenue * rainMultiplier);
      const predictedVisits = Math.max(Math.ceil(booked > 0 && baseRevenue > 0 ? (booked / baseRevenue) * Math.max(baseVisits, 1) : baseVisits * rainMultiplier), 0);
      const risk = rainMultiplier <= 0.8 ? "high" : rainMultiplier < 1 ? "medium" : "low";
      return { date: key, predictedVisits: Math.round(predictedVisits), predictedRevenue: Math.round(predictedRevenue * 100) / 100, confidenceLow: Math.max(0, Math.round((predictedRevenue - 1.96 * std) * 100) / 100), confidenceHigh: Math.round((predictedRevenue + 1.96 * std) * 100) / 100, weather: weather?.condition ?? null, risk: risk as "low" | "medium" | "high", factors: [booked ? `R$ ${booked.toFixed(0)} já agendado` : "Sem receita agendada", weather?.precipProbability && weather.precipProbability >= 45 ? `Chuva: ${weather.precipProbability}%` : "Sazonalidade por dia da semana"] };
    });
    const backtestValues = logs.slice(-30).map((log: any) => ({ actual: log.revenue ?? 0, predicted: avg(weekdayRevenue[log.date.getDay()]) || mean })).filter((item: any) => item.actual > 0);
    return { horizon, maturity, historicalDays, backtest: { mae: backtestValues.length ? Math.round(avg(backtestValues.map((item: any) => Math.abs(item.actual - item.predicted))) * 100) / 100 : null, mape: backtestValues.length ? Math.round(avg(backtestValues.map((item: any) => Math.abs(item.actual - item.predicted) / item.actual)) * 10000) / 100 : null }, predictions };
  }
}
