import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyForecast, IWeatherProvider } from '../IWeatherProvider';
import { CachedWeatherProvider } from './CachedWeatherProvider';

const redis = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('@/shared/infra/queue/redisConnection', () => ({
  getRedisConnection: () => redis,
}));

const forecast: DailyForecast[] = [
  {
    date: '2026-09-11',
    weatherCode: 0,
    tempMax: 30,
    tempMin: 20,
    precipMm: 0,
    precipProbability: 5,
    precipHours: 0,
    windSpeedMax: 10,
    humidity: 50,
    condition: 'Ensolarado',
    conditionIcon: 'sun',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue('OK');
});

describe('CachedWeatherProvider', () => {
  it('reaproveita uma requisição em andamento para evitar rajadas ao provedor', async () => {
    let resolveForecast!: (value: DailyForecast[]) => void;
    const upstream = {
      getForecast: vi.fn(
        () => new Promise<DailyForecast[]>(resolve => { resolveForecast = resolve; })
      ),
    } satisfies IWeatherProvider;
    const provider = new CachedWeatherProvider(upstream);

    const first = provider.getForecast(-20.95, -48.48, 7);
    const second = provider.getForecast(-20.95, -48.48, 7);
    await vi.waitFor(() => expect(upstream.getForecast).toHaveBeenCalledTimes(1));
    resolveForecast(forecast);

    await expect(Promise.all([first, second])).resolves.toEqual([forecast, forecast]);
  });

  it('usa a previsão stale quando o provedor está temporariamente limitado', async () => {
    redis.get.mockImplementation(async (key: string) =>
      key.endsWith(':stale') ? JSON.stringify(forecast) : null
    );
    const upstream = {
      getForecast: vi.fn().mockRejectedValue(new Error('Open-Meteo API error: 429')),
    } satisfies IWeatherProvider;
    const provider = new CachedWeatherProvider(upstream);

    await expect(provider.getForecast(-20.95, -48.48, 7)).resolves.toEqual(forecast);
  });
});
