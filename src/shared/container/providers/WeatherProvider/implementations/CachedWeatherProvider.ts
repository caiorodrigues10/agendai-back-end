import { IWeatherProvider, DailyForecast } from '../IWeatherProvider';
import { OpenMeteoWeatherProvider } from './OpenMeteoWeatherProvider';
import { getRedisConnection } from '@/shared/infra/queue/redisConnection';

export class CachedWeatherProvider implements IWeatherProvider {
  private readonly provider: IWeatherProvider;
  private readonly ttlSeconds = 6 * 60 * 60; // 6 hours
  private readonly staleTtlSeconds = 48 * 60 * 60; // 48 hours
  private readonly memoryCache = new Map<
    string,
    { forecast: DailyForecast[]; freshUntil: number; staleUntil: number }
  >();
  private readonly inFlight = new Map<string, Promise<DailyForecast[]>>();

  constructor(provider: IWeatherProvider = new OpenMeteoWeatherProvider()) {
    this.provider = provider;
  }

  async getForecast(latitude: number, longitude: number, days: number = 16): Promise<DailyForecast[]> {
    const cacheKey = `weather:forecast:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${days}`;
    const staleKey = `${cacheKey}:stale`;
    const memory = this.memoryCache.get(cacheKey);

    if (memory && memory.freshUntil > Date.now()) return memory.forecast;

    try {
      const redis = getRedisConnection();
      const cached = await redis.get(cacheKey);
      if (cached) {
        const forecast = JSON.parse(cached) as DailyForecast[];
        this.remember(cacheKey, forecast);
        return forecast;
      }
    } catch {
      // Redis indisponível: cache local e provedor continuam funcionando.
    }

    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;

    const request = this.fetchAndCache(cacheKey, staleKey, latitude, longitude, days, memory);
    this.inFlight.set(cacheKey, request);

    try {
      return await request;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async fetchAndCache(
    cacheKey: string,
    staleKey: string,
    latitude: number,
    longitude: number,
    days: number,
    memory?: { forecast: DailyForecast[]; freshUntil: number; staleUntil: number }
  ): Promise<DailyForecast[]> {
    try {
      const forecast = await this.provider.getForecast(latitude, longitude, days);
      this.remember(cacheKey, forecast);

      try {
        const redis = getRedisConnection();
        const serialized = JSON.stringify(forecast);
        await Promise.all([
          redis.set(cacheKey, serialized, 'EX', this.ttlSeconds),
          redis.set(staleKey, serialized, 'EX', this.staleTtlSeconds),
        ]);
      } catch {
        // A previsão continua válida no cache local desta instância.
      }

      return forecast;
    } catch (error) {
      if (memory && memory.staleUntil > Date.now()) return memory.forecast;

      try {
        const redis = getRedisConnection();
        const stale = await redis.get(staleKey);
        if (stale) {
          const forecast = JSON.parse(stale) as DailyForecast[];
          this.remember(cacheKey, forecast, false);
          return forecast;
        }
      } catch {
        // Sem cache stale disponível; preserva o erro original do provedor.
      }

      throw error;
    }
  }

  private remember(cacheKey: string, forecast: DailyForecast[], fresh = true): void {
    const now = Date.now();
    this.memoryCache.set(cacheKey, {
      forecast,
      freshUntil: fresh ? now + this.ttlSeconds * 1000 : now,
      staleUntil: now + this.staleTtlSeconds * 1000,
    });
  }
}
