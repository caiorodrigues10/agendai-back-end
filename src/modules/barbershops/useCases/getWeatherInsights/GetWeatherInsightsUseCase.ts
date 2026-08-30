import { injectable, inject } from 'tsyringe';
import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';
import { IWeatherProvider } from '@/shared/container/providers/WeatherProvider/IWeatherProvider';
import { DemandPredictor, WeatherDataPoint, WeatherForecastPoint } from '@/shared/providers/ml/DemandPredictor';

type RequestingUser = { role: string; barbershopId?: string };

@injectable()
export class GetWeatherInsightsUseCase {
  constructor(
    @inject('WeatherProvider')
    private weatherProvider: IWeatherProvider
  ) {}

  async execute(barbershopId: string, requestingUser: RequestingUser, days: number = 7) {
    if (requestingUser.role !== 'MASTER_ADMIN' && barbershopId !== requestingUser.barbershopId) {
      throw new AppError('Acesso negado', 403);
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { latitude: true, longitude: true, name: true },
    });

    if (!barbershop) {
      throw new AppError('Barbearia não encontrada', 404);
    }

    if (!barbershop.latitude || !barbershop.longitude) {
      throw new AppError(
        'Localização não configurada. Defina o endereço da barbearia nas configurações.',
        400
      );
    }

    const forecast = await this.weatherProvider.getForecast(
      barbershop.latitude,
      barbershop.longitude,
      days
    );

    const historicalLogs = await prisma.dailyWeatherLog.findMany({
      where: {
        barbershopId,
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

    const predictor = new DemandPredictor();

    if (historicalLogs.length >= 14) {
      const trainingData: WeatherDataPoint[] = historicalLogs.map((log: typeof historicalLogs[number]) => ({
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
      predictor.train(trainingData);
    }

    const forecastInput: WeatherForecastPoint[] = forecast.map(f => ({
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

    const predictions = predictor.predict(forecastInput, historicalLogs.length);

    const avgDrop = predictions.reduce((s, p) => s + p.dropPct, 0) / predictions.length;
    const highRiskDays = predictions.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical');
    const tomorrow = predictions[0] ?? null;

    const highlights: string[] = [];
    if (tomorrow && tomorrow.dropPct <= -15) {
      highlights.push(
        `Amanhã (${tomorrow.condition}): queda estimada de ${Math.abs(tomorrow.dropPct)}% nos atendimentos.`
      );
    }
    if (highRiskDays.length > 0) {
      const dates = highRiskDays.map(d => {
        const dt = new Date(d.date);
        return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      }).join(', ');
      highlights.push(`Dias de alta demanda negativa: ${dates}.`);
    }
    if (avgDrop < -10) {
      highlights.push(`Média de queda da semana: ${Math.abs(Math.round(avgDrop))}%. Considere ajustar equipe.`);
    }

    return {
      barbershopName: barbershop.name,
      location: { lat: barbershop.latitude, lng: barbershop.longitude },
      historicalDays: historicalLogs.length,
      modelTrained: predictor.isTrained(),
      predictions,
      summary: {
        avgDropPct: Math.round(avgDrop),
        highRiskCount: highRiskDays.length,
        bestDay: predictions.reduce((best, p) => p.dropPct > best.dropPct ? p : best, predictions[0]),
        worstDay: predictions.reduce((worst, p) => p.dropPct < worst.dropPct ? p : worst, predictions[0]),
      },
      highlights,
    };
  }
}
