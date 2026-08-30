import { IWeatherProvider, DailyForecast } from '../IWeatherProvider';

/** WMO Weather interpretation codes → human-readable + icon */
const WMO_CODES: Record<number, { condition: string; icon: string }> = {
  0: { condition: 'Ensolarado', icon: '☀️' },
  1: { condition: 'Principalmente ensolarado', icon: '🌤️' },
  2: { condition: 'Parcialmente nublado', icon: '⛅' },
  3: { condition: 'Nublado', icon: '☁️' },
  45: { condition: 'Nevoeiro', icon: '🌫️' },
  48: { condition: 'Geada', icon: '🌫️' },
  51: { condition: 'Chuva leve', icon: '🌦️' },
  53: { condition: 'Chuva moderada', icon: '🌦️' },
  55: { condition: 'Chuva intensa', icon: '🌧️' },
  56: { condition: 'Chuva gelada leve', icon: '🌧️' },
  57: { condition: 'Chuva gelada intensa', icon: '🌧️' },
  61: { condition: 'Chuva leve', icon: '🌧️' },
  63: { condition: 'Chuva moderada', icon: '🌧️' },
  65: { condition: 'Chuva forte', icon: '🌧️' },
  66: { condition: 'Chuva gelada leve', icon: '🌧️' },
  67: { condition: 'Chuva gelada forte', icon: '🌧️' },
  71: { condition: 'Neve leve', icon: '❄️' },
  73: { condition: 'Neve moderada', icon: '❄️' },
  75: { condition: 'Neve forte', icon: '❄️' },
  77: { condition: 'Granizo', icon: '🧊' },
  80: { condition: 'Pancadas leves', icon: '🌦️' },
  81: { condition: 'Pancadas moderadas', icon: '🌧️' },
  82: { condition: 'Pancadas fortes', icon: '⛈️' },
  85: { condition: 'Neve com pancadas', icon: '🌨️' },
  86: { condition: 'Neve forte com pancadas', icon: '🌨️' },
  95: { condition: 'Tempestade', icon: '⛈️' },
  96: { condition: 'Tempestade com granizo', icon: '⛈️' },
  99: { condition: 'Tempestade com granizo forte', icon: '⛈️' },
};

const DEFAULT_CONDITION = { condition: 'Desconhecido', icon: '🌡️' };

export class OpenMeteoWeatherProvider implements IWeatherProvider {
  private readonly baseUrl = 'https://api.open-meteo.com/v1/forecast';

  async getForecast(latitude: number, longitude: number, days: number = 16): Promise<DailyForecast[]> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'precipitation_probability_max',
        'precipitation_hours',
        'wind_speed_10m_max',
        'relative_humidity_2m_max',
      ].join(','),
      timezone: 'auto',
      forecast_days: String(days),
    });

    const response = await fetch(`${this.baseUrl}?${params}`);
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }

    const data = await response.json();
    const daily = data.daily;

    if (!daily || !daily.time) {
      throw new Error('Invalid Open-Meteo response');
    }

    return daily.time.map((date: string, i: number) => {
      const code = daily.weather_code?.[i] ?? 0;
      const wmo = WMO_CODES[code] ?? DEFAULT_CONDITION;

      return {
        date,
        weatherCode: code,
        tempMax: daily.temperature_2m_max?.[i] ?? 0,
        tempMin: daily.temperature_2m_min?.[i] ?? 0,
        precipMm: daily.precipitation_sum?.[i] ?? 0,
        precipProbability: daily.precipitation_probability_max?.[i] ?? 0,
        precipHours: daily.precipitation_hours?.[i] ?? 0,
        windSpeedMax: daily.wind_speed_10m_max?.[i] ?? 0,
        humidity: daily.relative_humidity_2m_max?.[i] ?? 50,
        condition: wmo.condition,
        conditionIcon: wmo.icon,
      };
    });
  }
}
