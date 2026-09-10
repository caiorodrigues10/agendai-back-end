import { FastifyRequest, FastifyReply } from 'fastify';
import { EnhancedDemandPredictor } from '@/shared/providers/ml/enhancedDemandPredictor';
import { RecommendationEngine } from './services/recommendationEngine';
import { AppError } from '@/shared/errors/AppError';
import { prisma } from '@/libs/prismaClient';
import { container } from 'tsyringe';
import { IWeatherProvider } from '@/shared/container/providers/WeatherProvider/IWeatherProvider';

export class AnalyticsController {
  async enhancedForecast(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === 'MASTER_ADMIN'
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError('barbershopId is required', 400);

    const predictor = new EnhancedDemandPredictor(resolvedBarbershopId);

    const historicalLogs = await prisma.dailyWeatherLog.findMany({
      where: {
        barbershopId: resolvedBarbershopId,
        date: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        queueCount: true,
        appointmentCount: true,
        revenue: true,
        precipitationMm: true,
        precipitationPct: true,
        temperatureMax: true,
        temperatureMin: true,
        windSpeedMax: true,
        humidity: true,
        weatherCode: true,
      },
    });

    const trainingData = historicalLogs.map((log: typeof historicalLogs[number]) => ({
      date: log.date.toISOString().slice(0, 10),
      queueCount: log.queueCount,
      appointmentCount: log.appointmentCount,
      revenue: log.revenue ?? undefined,
      precipMm: log.precipitationMm ?? 0,
      precipPct: log.precipitationPct ?? 0,
      tempMax: log.temperatureMax ?? 25,
      tempMin: log.temperatureMin ?? 18,
      windSpeedMax: log.windSpeedMax ?? 0,
      humidity: log.humidity ?? 50,
      weatherCode: log.weatherCode ?? 0,
    }));

    if (trainingData.length >= 14) {
      await predictor.train(trainingData);
    }

    const forecast = await this.getForecast(resolvedBarbershopId);
    const forecastInput = forecast.map(f => ({
      date: f.date,
      precipMm: f.precipMm,
      precipPct: f.precipProbability,
      tempMax: f.tempMax,
      tempMin: f.tempMin,
      windSpeedMax: f.windSpeedMax,
      humidity: f.humidity,
      weatherCode: f.weatherCode,
      condition: f.condition,
    }));
    const predictions = await predictor.predict(forecastInput, historicalLogs.length);

    reply.send({
      success: true,
      data: {
        barbershopId: resolvedBarbershopId,
        historicalDays: historicalLogs.length,
        forecast,
        predictions,
      },
    });
  }

  async recommendations(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === 'MASTER_ADMIN'
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError('barbershopId is required', 400);

    const engine = new RecommendationEngine(resolvedBarbershopId);
    const recommendations = await engine.generate();

    reply.send({
      success: true,
      data: {
        barbershopId: resolvedBarbershopId,
        count: recommendations.length,
        recommendations,
      },
    });
  }

  async dismissRecommendation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === 'MASTER_ADMIN'
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError('barbershopId is required', 400);

    const engine = new RecommendationEngine(resolvedBarbershopId);
    const dismissed = await engine.dismiss(id);

    if (!dismissed) {
      throw new AppError('Recommendation not found', 404);
    }

    reply.send({ success: true, data: { dismissed: true } });
  }

  private async getForecast(barbershopId: string) {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { latitude: true, longitude: true },
    });

    if (!barbershop?.latitude || !barbershop?.longitude) {
      return [];
    }

    try {
      const weatherProvider = container.resolve<IWeatherProvider>('WeatherProvider');
      return await weatherProvider.getForecast(barbershop.latitude, barbershop.longitude, 7);
    } catch {
      return [];
    }
  }
}
