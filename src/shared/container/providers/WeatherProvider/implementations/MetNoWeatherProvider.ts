import type { DailyForecast, IWeatherProvider } from '../IWeatherProvider';

type MetNoPeriod = {
  summary?: { symbol_code?: string };
  details?: { precipitation_amount?: number; probability_of_precipitation?: number };
};

type MetNoPoint = {
  time: string;
  data: {
    instant?: {
      details?: {
        air_temperature?: number;
        relative_humidity?: number;
        wind_speed?: number;
      };
    };
    next_1_hours?: MetNoPeriod;
    next_6_hours?: MetNoPeriod;
  };
};

const symbolDetails = (symbol = '') => {
  const normalized = symbol.toLowerCase();
  if (normalized.includes('thunder')) return { code: 95, condition: 'Tempestade', icon: '⛈️' };
  if (normalized.includes('heavyrain')) return { code: 65, condition: 'Chuva forte', icon: '🌧️' };
  if (normalized.includes('rain') || normalized.includes('sleet')) return { code: 61, condition: 'Chuva', icon: '🌧️' };
  if (normalized.includes('snow')) return { code: 71, condition: 'Neve', icon: '❄️' };
  if (normalized.includes('fog')) return { code: 45, condition: 'Nevoeiro', icon: '🌫️' };
  if (normalized.includes('partlycloudy')) return { code: 2, condition: 'Parcialmente nublado', icon: '⛅' };
  if (normalized.includes('cloudy')) return { code: 3, condition: 'Nublado', icon: '☁️' };
  return { code: 0, condition: 'Ensolarado', icon: '☀️' };
};

export function parseMetNoForecast(points: MetNoPoint[], days: number): DailyForecast[] {
  const grouped = new Map<string, MetNoPoint[]>();
  for (const point of points) {
    const date = point.time.slice(0, 10);
    grouped.set(date, [...(grouped.get(date) ?? []), point]);
  }

  return [...grouped.entries()].slice(0, days).map(([date, entries]) => {
    const temperatures = entries
      .map(entry => entry.data.instant?.details?.air_temperature)
      .filter((value): value is number => typeof value === 'number');
    const humidities = entries
      .map(entry => entry.data.instant?.details?.relative_humidity)
      .filter((value): value is number => typeof value === 'number');
    const winds = entries
      .map(entry => entry.data.instant?.details?.wind_speed)
      .filter((value): value is number => typeof value === 'number');
    const periods = entries.map(entry => entry.data.next_1_hours ?? entry.data.next_6_hours);
    const precipitation = periods.reduce(
      (sum, period) => sum + (period?.details?.precipitation_amount ?? 0),
      0
    );
    const probabilities = periods
      .map(period => period?.details?.probability_of_precipitation)
      .filter((value): value is number => typeof value === 'number');
    const representative = entries[Math.floor(entries.length / 2)];
    const period = representative?.data.next_6_hours ?? representative?.data.next_1_hours;
    const weather = symbolDetails(period?.summary?.symbol_code);

    return {
      date,
      weatherCode: weather.code,
      tempMax: temperatures.length ? Math.max(...temperatures) : 0,
      tempMin: temperatures.length ? Math.min(...temperatures) : 0,
      precipMm: Math.round(precipitation * 10) / 10,
      precipProbability: probabilities.length ? Math.max(...probabilities) : 0,
      precipHours: periods.filter(item => (item?.details?.precipitation_amount ?? 0) > 0).length,
      windSpeedMax: winds.length ? Math.round(Math.max(...winds) * 3.6 * 10) / 10 : 0,
      humidity: humidities.length ? Math.round(Math.max(...humidities)) : 50,
      condition: weather.condition,
      conditionIcon: weather.icon,
    };
  });
}

export class MetNoWeatherProvider implements IWeatherProvider {
  private readonly baseUrl = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

  async getForecast(latitude: number, longitude: number, days = 9): Promise<DailyForecast[]> {
    const params = new URLSearchParams({
      lat: latitude.toFixed(4),
      lon: longitude.toFixed(4),
    });
    const response = await fetch(`${this.baseUrl}?${params}`, {
      headers: {
        'User-Agent': process.env.WEATHER_USER_AGENT || 'AgendAI/1.4 (https://agendai-pcts.onrender.com/contato)',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`MET Norway API error: ${response.status}`);

    const payload = await response.json() as {
      properties?: { timeseries?: MetNoPoint[] };
    };
    const points = payload.properties?.timeseries;
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error('Invalid MET Norway response');
    }
    return parseMetNoForecast(points, days);
  }
}
