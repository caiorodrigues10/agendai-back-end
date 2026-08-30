import { IWeatherProvider, DailyForecast } from '../IWeatherProvider';
import { OpenMeteoWeatherProvider } from './OpenMeteoWeatherProvider';
import { getRedisConnection } from '@/shared/infra/queue/redisConnection';

export class CachedWeatherProvider implements IWeatherProvider {
  private provider: OpenMeteoWeatherProvider;
  private ttlSeconds = 6 * 60 * 60; // 6 hours

  constructor() {
    this.provider = new OpenMeteoWeatherProvider();
  }

  async getForecast(latitude: number, longitude: number, days: number = 16): Promise<DailyForecast[]> {
    const cacheKey = `weather:forecast:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${days}`;

    try {
      const redis = getRedisConnection();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable, fetch fresh
    }

    const forecast = await this.provider.getForecast(latitude, longitude, days);

    try {
      const redis = getRedisConnection();
      await redis.set(cacheKey, JSON.stringify(forecast), 'EX', this.ttlSeconds);
    } catch {
      // Redis write failed, continue with fresh data
    }

    return forecast;
  }
}
