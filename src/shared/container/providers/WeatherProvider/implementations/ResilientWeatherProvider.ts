import type { DailyForecast, IWeatherProvider } from '../IWeatherProvider';
import { MetNoWeatherProvider } from './MetNoWeatherProvider';
import { OpenMeteoWeatherProvider } from './OpenMeteoWeatherProvider';

export class ResilientWeatherProvider implements IWeatherProvider {
  constructor(
    private readonly providers: IWeatherProvider[] = [
      new OpenMeteoWeatherProvider(),
      new MetNoWeatherProvider(),
    ]
  ) {}

  async getForecast(latitude: number, longitude: number, days = 7): Promise<DailyForecast[]> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        const forecast = await provider.getForecast(latitude, longitude, days);
        if (forecast.length > 0) return forecast;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error('Weather providers unavailable');
  }
}
